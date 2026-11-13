import { createHash, randomUUID } from "node:crypto";
import type { IssuingGateway } from "../airwallex/types.js";
import { config } from "../config.js";
import { applyChangeOrder, draftChangeOrder } from "../contract/changeOrder.js";
import { parseContract, type ContractSource } from "../contract/parser.js";
import { validateTerms } from "../contract/schema.js";
import { computeValidatedExceptionCap, draftPolicyException } from "../expense/exception.js";
import { looksLikePolicyDocument, parsePolicy } from "../expense/parser.js";
import { synthesizeContractTermsFromPolicy, validatePolicyTerms } from "../expense/schema.js";
import { MockMetalRail } from "../metal/mock.js";
import {
  MOCK_WRONG_PAYEE_ADDRESS,
  type JobMandateEvent,
  type MetalRail,
  contractToMandateTerms,
  explainMandateRefusal,
  round2,
  shortenAddress,
  usdToUsdz,
  usdzToUsd,
} from "../metal/types.js";
import { buildCardPlan, buildPolicyCardPlan, nextMilestone } from "../policy/cardRules.js";
import { explainDecline, explainPolicyDecline } from "../policy/declineExplainer.js";
import type { Job, JobEvent, JobStore } from "../store/jobStore.js";
import { evaluateEvidence, type EvidenceFile } from "./evidence.js";

/**
 * The agent's state machine. Model output is only ever a *proposal* (terms, verdict, change
 * order, or §3.4 policy exception). Every money-moving step is code, and every limit increase
 * needs an owner/manager approval bound to what they saw.
 *
 *   draft --approveTerms--> active (card issued at M1 limit + on-chain Metal mandate bound)
 *   active --submitProof--> pending release --approveRelease--> limit raised + Metal milestone payout
 *   active --proposeChangeOrder--> pending change --approveChangeOrder--> card & mandate re-derived
 *   active --requestException--> pending exception --approveException--> one-time cap raised, auto-restored
 *   active --closeJob--> closed (card CLOSED)
 */
export class ContractCardService {
  constructor(
    private readonly gateway: IssuingGateway,
    private readonly store: JobStore,
    private readonly contractorEmail: string,
    private readonly metal: MetalRail = new MockMetalRail(),
  ) {}

  async getJob(id: string): Promise<Job> {
    return await this.store.get(id);
  }

  async createJob(src: ContractSource): Promise<Job> {
    if (looksLikePolicyDocument(src)) {
      const { policyTerms, problems, parsedBy } = await parsePolicy(src);
      const job: Job = {
        id: `job_${randomUUID().slice(0, 8)}`,
        kind: "policy",
        status: "draft",
        terms: synthesizeContractTermsFromPolicy(policyTerms),
        policyTerms,
        problems,
        parsedBy,
        releasedMilestoneIds: [],
        rules: [],
        transactions: [],
        events: [],
      };
      log(
        job,
        "terms_parsed",
        `Parsed ${policyTerms.policy_ref}: budget ${policyTerms.currency} ${policyTerms.budget.amount}, per-charge cap ${policyTerms.currency} ${policyTerms.per_charge_cap.amount}`,
      );
      return await this.store.save(job);
    }

    const { terms, problems, parsedBy } = await parseContract(src);
    const job: Job = {
      id: `job_${randomUUID().slice(0, 8)}`,
      kind: "contract",
      status: "draft",
      terms,
      problems,
      parsedBy,
      releasedMilestoneIds: [],
      rules: [],
      transactions: [],
      events: [],
    };
    log(job, "terms_parsed", `Parsed ${terms.contract_ref}: ${terms.milestones.length} milestones, ${terms.currency} ${terms.total_amount}`);
    return await this.store.save(job);
  }

  /** Owner/manager reviewed the extracted terms and clicked "Issue card". */
  async approveTerms(jobId: string): Promise<Job> {
    const job = await this.store.get(jobId);
    if (job.status !== "draft") throw new Error("Terms already approved.");

    if (job.kind === "policy" && job.policyTerms) {
      const pt = job.policyTerms;
      const problems = [...validatePolicyTerms(pt), ...pt.open_questions];
      if (problems.length) throw new Error(`Resolve before issuing a card: ${problems.join(" | ")}`);

      const plan = buildPolicyCardPlan(pt);
      const holder = await this.gateway.createDelegateCardholder(this.contractorEmail);
      const card = await this.gateway.createCard({
        cardholder_id: holder.cardholder_id,
        nick_name: `${pt.policy_ref} ${pt.traveler}`.slice(0, 40),
        authorization_controls: plan.controls,
      });
      Object.assign(job, {
        status: "active",
        cardholder_id: holder.cardholder_id,
        card_id: card.card_id,
        releasedMilestoneIds: ["TRIP"],
        rules: plan.rules,
      });
      log(job, "terms_approved", `Approved policy & trip controls (${pt.policy_ref})`);
      log(
        job,
        "card_issued",
        `Card ${card.card_id} issued, budget ${pt.currency} ${plan.releasedAmount}, per-charge cap ${pt.currency} ${pt.per_charge_cap.amount}`,
        plan.controls,
      );
      return await this.store.save(job);
    }

    const problems = [...validateTerms(job.terms), ...job.terms.open_questions];
    if (problems.length) throw new Error(`Resolve before issuing a card: ${problems.join(" | ")}`);

    const signing = job.terms.milestones.filter((m) => m.released_on_signing).map((m) => m.id);
    const plan = buildCardPlan(job.terms, signing);
    const holder = await this.gateway.createDelegateCardholder(this.contractorEmail);
    const card = await this.gateway.createCard({
      cardholder_id: holder.cardholder_id,
      nick_name: `${job.terms.contract_ref} ${job.terms.contractor_name}`.slice(0, 40),
      authorization_controls: plan.controls,
    });
    Object.assign(job, { status: "active", cardholder_id: holder.cardholder_id, card_id: card.card_id, releasedMilestoneIds: signing, rules: plan.rules });
    log(job, "terms_approved", "Owner approved extracted terms");
    log(job, "card_issued", `Card ${card.card_id} issued, limit ${job.terms.currency} ${plan.releasedAmount}`, plan.controls);

    const mandateTerms = contractToMandateTerms(job);
    const issued = await this.metal.issueMandate(job, mandateTerms);
    const nowIso = new Date().toISOString();
    const issueEvent: JobMandateEvent = {
      id: `mev_${randomUUID().slice(0, 8)}`,
      at: nowIso,
      kind: "issued",
      clause: mandateTerms.clauses.budget,
      ...(issued.txHash ? { txHash: issued.txHash } : {}),
      explorerUrl: issued.explorerUrl,
      detail: `Bound Metal mandate (${this.metal.mode}) · cap ${mandateTerms.cap.toFixed(2)} USDZ (${mandateTerms.clauses.cap.clause_id}), budget ${mandateTerms.budget.toFixed(2)} USDZ, max ${mandateTerms.maxOccurrences} payouts`,
    };
    job.mandate = {
      mode: this.metal.mode,
      mandateId: issued.mandateId,
      version: issued.version,
      ...(issued.credentialFile ? { credentialFile: issued.credentialFile } : {}),
      ...(issued.txHash ? { txHash: issued.txHash } : {}),
      explorerUrl: issued.explorerUrl,
      terms: issued.terms,
      spent: issued.spent,
      budget: issued.budget,
      occurrencesUsed: issued.occurrencesUsed,
      events: [issueEvent],
    };
    log(
      job,
      "mandate_issued",
      `Metal mandate ${issued.mandateId.slice(0, 10)}… bound (${this.metal.mode}): cap ${mandateTerms.cap.toFixed(2)} USDZ (${mandateTerms.clauses.cap.clause_id}), budget ${mandateTerms.budget.toFixed(2)} USDZ`,
      issued,
    );
    return await this.store.save(job);
  }

  /** Sandbox-only: simulate the contractor or employee using the card. */
  async simulateCharge(jobId: string, c: { amount: number; merchant_name: string; mcc: string; currency?: string; at?: string }) {
    const job = await this.activeJob(jobId);

    if (job.kind === "policy" && job.policyTerms) {
      const pt = job.policyTerms;
      // Expire active one-time exception if >2h elapsed
      if (job.activeException) {
        const swipeTime = c.at ? Date.parse(c.at) : Date.now();
        if (!Number.isNaN(swipeTime) && swipeTime > Date.parse(job.activeException.expires_at)) {
          const basePlan = buildPolicyCardPlan(pt);
          await this.gateway.updateCard(job.card_id!, { authorization_controls: basePlan.controls });
          job.rules = basePlan.rules;
          delete job.activeException;
          log(
            job,
            "exception_used",
            `Exception window expired — per-charge cap back to $${pt.per_charge_cap.amount}`,
            basePlan.controls,
          );
        }
      }

      const activeCap = job.activeException
        ? job.activeException.one_time_cap
        : pt.per_charge_cap.amount;

      const txn = await this.gateway.simulateAuthorization({
        card_id: job.card_id!,
        amount: c.amount,
        currency: c.currency ?? pt.currency,
        merchant_name: c.merchant_name,
        merchant_category_code: c.mcc,
        ...(c.at !== undefined ? { at: c.at } : {}),
      });
      const explanation = explainPolicyDecline(txn, job.rules, pt, activeCap);
      job.transactions.push(explanation ? { ...txn, explanation } : { ...txn });

      if (explanation) {
        log(job, "charge_declined", explanation.headline, explanation);
      } else {
        log(job, "charge_approved", `Approved ${txn.currency} ${txn.amount} at ${txn.merchant_name}`);
        if (job.activeException) {
          const basePlan = buildPolicyCardPlan(pt);
          await this.gateway.updateCard(job.card_id!, { authorization_controls: basePlan.controls });
          job.rules = basePlan.rules;
          delete job.activeException;
          log(
            job,
            "exception_used",
            `Exception used — per-charge cap back to $${pt.per_charge_cap.amount}`,
            basePlan.controls,
          );
        }
      }
      await this.store.save(job);
      return { txn, explanation };
    }

    const txn = await this.gateway.simulateAuthorization({
      card_id: job.card_id!,
      amount: c.amount,
      currency: c.currency ?? job.terms.currency,
      merchant_name: c.merchant_name,
      merchant_category_code: c.mcc,
      ...(c.at !== undefined ? { at: c.at } : {}),
    });
    const explanation = explainDecline(txn, job.rules, job.terms.prohibited_spend);
    job.transactions.push(explanation ? { ...txn, explanation } : { ...txn });
    if (explanation) log(job, "charge_declined", explanation.headline, explanation);
    else log(job, "charge_approved", `Approved ${txn.currency} ${txn.amount} at ${txn.merchant_name}`);
    await this.store.save(job);
    return { txn, explanation };
  }

  /** Employee explains a declined entertainment charge; model proposes §3.4 exception, code validates cap. */
  async requestException(
    jobId: string,
    note: string,
    opts: { requestedCap?: number } = {},
  ): Promise<Job> {
    const job = await this.activeJob(jobId);
    if (job.kind !== "policy" || !job.policyTerms) {
      throw new Error("Policy exceptions only apply to travel & expense trip cards.");
    }
    const lastDeclined = [...job.transactions]
      .reverse()
      .find((t) => t.failure_reason === "LIMIT_EXCEEDED" && t.amount > job.policyTerms!.per_charge_cap.amount);

    const proposal = await draftPolicyException(job.policyTerms, note, {
      ...(lastDeclined ? { requestedCharge: lastDeclined.amount } : {}),
      ...(opts.requestedCap !== undefined ? { requestedCap: opts.requestedCap } : {}),
    });

    job.pending = {
      approval_id: `appr_${randomUUID().slice(0, 8)}`,
      kind: "policy_exception",
      amount: proposal.one_time_cap,
      currency: job.policyTerms.currency,
      exception: proposal,
      created_at: new Date().toISOString(),
    };
    log(
      job,
      "exception_requested",
      `Exception requested (${proposal.clause.clause_id}): ${proposal.client}, ${proposal.attendees} attendees, cap ${job.policyTerms.currency} ${proposal.one_time_cap}`,
      proposal,
    );
    return await this.store.save(job);
  }

  /** Manager approves pending §3.4 exception: raises PER_TRANSACTION cap for one charge (or 2h). */
  async approveException(jobId: string, approval_id: string): Promise<Job> {
    const job = await this.activeJob(jobId);
    if (job.kind !== "policy" || !job.policyTerms) {
      throw new Error("Policy exceptions only apply to travel & expense trip cards.");
    }
    const p = job.pending;
    if (!p || p.kind !== "policy_exception" || p.approval_id !== approval_id || !p.exception) {
      throw new Error("No matching policy exception pending.");
    }
    const rule = job.policyTerms.exception_clause;
    if (!rule) throw new Error("This policy has no exception clause.");

    const { one_time_cap } = computeValidatedExceptionCap({
      client: p.exception.client,
      attendees: p.exception.attendees,
      attendee_names: p.exception.attendee_names,
      perAttendeeCap: rule.per_attendee_cap,
      requestedCap: p.exception.one_time_cap,
    });

    const plan = buildPolicyCardPlan(job.policyTerms, {
      perTransactionCapOverride: one_time_cap,
      perTransactionClauseOverride: p.exception.clause,
    });
    await this.gateway.updateCard(job.card_id!, { authorization_controls: plan.controls });
    job.rules = plan.rules;
    job.activeException = {
      approval_id: p.approval_id,
      one_time_cap,
      base_per_charge_cap: job.policyTerms.per_charge_cap.amount,
      client: p.exception.client,
      attendees: p.exception.attendees,
      clause: p.exception.clause,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
    delete job.pending;
    log(
      job,
      "exception_approved",
      `Manager ${job.policyTerms.approver} approved ${p.exception.clause.clause_id} exception: one charge up to ${job.policyTerms.currency} ${one_time_cap} at restaurants`,
      plan.controls,
    );
    return await this.store.save(job);
  }

  async submitProof(jobId: string, files: EvidenceFile[]): Promise<Job> {
    const job = await this.activeJob(jobId);
    const milestone = nextMilestone(job.terms, job.releasedMilestoneIds);
    if (!milestone) throw new Error("All milestones already released.");
    const verdict = await evaluateEvidence(milestone, files);
    job.pending = {
      approval_id: `appr_${randomUUID().slice(0, 8)}`,
      kind: "release_milestone",
      milestone_id: milestone.id,
      amount: milestone.amount,
      currency: job.terms.currency,
      evidence_sha256: hashFiles(files),
      verdict,
      created_at: new Date().toISOString(),
    };
    log(job, "proof_submitted", `Proof for ${milestone.id}: agent says "${verdict.verdict}". ${verdict.reasoning}`, verdict);
    return await this.store.save(job);
  }

  /** Owner taps Approve. The approval must match what is pending, field for field. */
  async approveRelease(
    jobId: string,
    approval: { approval_id: string; milestone_id: string; amount: number; currency?: string; evidence_sha256?: string },
  ): Promise<Job> {
    const job = await this.activeJob(jobId);
    const p = job.pending;
    if (!p || p.kind !== "release_milestone") throw new Error("Nothing pending to release.");
    if (
      p.approval_id !== approval.approval_id ||
      p.milestone_id !== approval.milestone_id ||
      p.amount !== approval.amount ||
      (approval.currency !== undefined && approval.currency !== p.currency) ||
      (approval.evidence_sha256 !== undefined && approval.evidence_sha256 !== p.evidence_sha256)
    ) {
      throw new Error("Approval does not match the pending release (stale or tampered). Re-review.");
    }
    if (p.verdict?.verdict === "insufficient") throw new Error("Evidence was judged insufficient. Request new proof, or reject.");
    const releasedId = p.milestone_id!;
    const released = [...job.releasedMilestoneIds, releasedId];
    const plan = buildCardPlan(job.terms, released);
    await this.gateway.updateCard(job.card_id!, { authorization_controls: plan.controls });
    Object.assign(job, { releasedMilestoneIds: released, rules: plan.rules });
    delete job.pending;
    log(job, "release_approved", `Released ${releasedId}. Card limit now ${job.terms.currency} ${plan.releasedAmount}`, plan.controls);

    // Execute contractor milestone payout on Metal mandate rail + treasury mirror
    const milestone = job.terms.milestones.find((m) => m.id === releasedId);
    if (milestone && job.kind !== "policy") {
      if (!job.mandate) {
        const terms = contractToMandateTerms(job);
        const issued = await this.metal.issueMandate(job, terms);
        job.mandate = {
          mode: this.metal.mode,
          mandateId: issued.mandateId,
          version: issued.version,
          ...(issued.credentialFile ? { credentialFile: issued.credentialFile } : {}),
          ...(issued.txHash ? { txHash: issued.txHash } : {}),
          explorerUrl: issued.explorerUrl,
          terms: issued.terms,
          spent: issued.spent,
          budget: issued.budget,
          occurrencesUsed: issued.occurrencesUsed,
          events: [],
        };
      }

      const amountUsdz = usdToUsdz(milestone.amount);
      const paymentId = `${job.id}-${milestone.id}`;
      const payee = job.mandate.terms.payee;
      const payoutRes = await this.metal.payout(job, {
        milestoneId: milestone.id,
        amount: amountUsdz,
        to: payee,
        paymentId,
      });
      const nowIso = new Date().toISOString();

      let depositId: string | undefined;
      if (payoutRes.outcome === "paid") {
        job.mandate.spent = payoutRes.spent ?? round2(job.mandate.spent + amountUsdz);
        job.mandate.occurrencesUsed =
          payoutRes.occurrencesUsed ?? job.mandate.occurrencesUsed + 1;
        if (payoutRes.budget !== undefined) {
          job.mandate.budget = payoutRes.budget;
        }

        const mirrorUsd = usdzToUsd(amountUsdz);
        const ref = payoutRes.txHash ?? paymentId;
        try {
          const dep = await this.gateway.simulateDeposit({
            amount: mirrorUsd,
            reference: ref,
            currency: job.terms.currency,
          });
          depositId = dep.deposit_id;
          job.deposits = [...(job.deposits ?? []), dep];
          log(
            job,
            "treasury_deposit",
            `Treasury mirror: ${job.terms.currency} ${mirrorUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} deposit (${dep.payer_name})`,
            dep,
          );
        } catch (err) {
          console.warn("[Clause] Airwallex deposit simulation failed (continuing):", err);
        }

        const txDisplay = payoutRes.txHash ?? "pending";
        log(
          job,
          "metal_payout",
          `Paid ${amountUsdz.toFixed(2)} USDZ on Metal · tx ${txDisplay}`,
          payoutRes,
        );
        job.mandate.events.push({
          id: `mev_${randomUUID().slice(0, 8)}`,
          at: nowIso,
          kind: "payout",
          outcome: "paid",
          milestoneId: milestone.id,
          amount: amountUsdz,
          amountUsd: milestone.amount,
          to: payee,
          clause: milestone.clause,
          ...(payoutRes.txHash ? { txHash: payoutRes.txHash } : {}),
          explorerUrl: payoutRes.explorerUrl ?? null,
          ...(depositId ? { depositId } : {}),
          detail: `Paid ${amountUsdz.toFixed(2)} USDZ ($${milestone.amount.toLocaleString("en-US")}) for ${milestone.id} · tx ${txDisplay.slice(0, 10)}…`,
        });
      } else if (payoutRes.outcome === "refused") {
        const cited = explainMandateRefusal(payoutRes.reason, job.mandate.terms, job.terms);
        log(
          job,
          "metal_refused",
          `Refused ${amountUsdz.toFixed(2)} USDZ payout for ${milestone.id} on Metal: ${payoutRes.reason} (${cited.clause.clause_id})`,
          { ...payoutRes, clause: cited.clause },
        );
        job.mandate.events.push({
          id: `mev_${randomUUID().slice(0, 8)}`,
          at: nowIso,
          kind: "refused",
          outcome: "refused",
          milestoneId: milestone.id,
          amount: amountUsdz,
          amountUsd: milestone.amount,
          to: payee,
          ...(payoutRes.reason ? { reason: payoutRes.reason } : {}),
          clause: cited.clause,
          ...(payoutRes.txHash ? { txHash: payoutRes.txHash } : {}),
          explorerUrl: payoutRes.explorerUrl ?? null,
          detail: `Refused ${amountUsdz.toFixed(2)} USDZ for ${milestone.id}: ${payoutRes.reason} (${cited.clause.clause_id})`,
        });
      } else {
        log(
          job,
          "metal_payout",
          `Pending ${amountUsdz.toFixed(2)} USDZ payout for ${milestone.id} on Metal`,
          payoutRes,
        );
      }

      milestone.payout = {
        outcome: payoutRes.outcome,
        amount: amountUsdz,
        amount_usd: milestone.amount,
        to: payee,
        payment_id: paymentId,
        ...(payoutRes.txHash ? { tx_hash: payoutRes.txHash } : {}),
        explorer_url: payoutRes.explorerUrl ?? null,
        ...(payoutRes.reason ? { reason: payoutRes.reason } : {}),
        ...(depositId ? { deposit_id: depositId } : {}),
        at: nowIso,
      };
    }

    return await this.store.save(job);
  }

  async rejectPending(jobId: string, reason: string): Promise<Job> {
    const job = await this.activeJob(jobId);
    if (!job.pending) throw new Error("Nothing pending.");
    log(job, "release_rejected", `Owner rejected ${job.pending.kind}: ${reason}`);
    delete job.pending;
    return await this.store.save(job);
  }

  async proposeChangeOrder(jobId: string, emailText: string): Promise<Job> {
    const job = await this.activeJob(jobId);
    const co = await draftChangeOrder(job.terms, emailText);
    job.pending = { approval_id: `appr_${randomUUID().slice(0, 8)}`, kind: "change_order", currency: job.terms.currency, change_order: co, created_at: new Date().toISOString() };
    log(job, "change_order_drafted", co.summary, co);
    return await this.store.save(job);
  }

  async approveChangeOrder(jobId: string, approval_id: string): Promise<Job> {
    const job = await this.activeJob(jobId);
    const p = job.pending;
    if (!p || p.kind !== "change_order" || p.approval_id !== approval_id || !p.change_order) throw new Error("No matching change order pending.");
    const terms = applyChangeOrder(job.terms, p.change_order);
    const plan = buildCardPlan(terms, job.releasedMilestoneIds);
    await this.gateway.updateCard(job.card_id!, { authorization_controls: plan.controls });
    Object.assign(job, { terms, rules: plan.rules });
    delete job.pending;
    log(job, "change_order_approved", `Change order applied. Deadline ${terms.deadline.date}, total ${terms.currency} ${terms.total_amount}`, plan.controls);

    if (job.mandate && job.kind !== "policy") {
      const nextMandateTerms = contractToMandateTerms(
        { id: job.id, terms },
        { payee: job.mandate.terms.payee },
      );
      if (
        nextMandateTerms.cap > job.mandate.terms.cap ||
        nextMandateTerms.budget > job.mandate.terms.budget
      ) {
        const replaced = await this.metal.replaceMandate(job, nextMandateTerms);
        const coClause =
          terms.change_order_clause ?? nextMandateTerms.clauses.budget;
        const replaceEvent: JobMandateEvent = {
          id: `mev_${randomUUID().slice(0, 8)}`,
          at: new Date().toISOString(),
          kind: "replaced",
          clause: coClause,
          ...(replaced.txHash ? { txHash: replaced.txHash } : {}),
          explorerUrl: replaced.explorerUrl,
          detail: `Replaced mandate (v${replaced.version}): cap ${nextMandateTerms.cap.toFixed(2)} USDZ, budget ${nextMandateTerms.budget.toFixed(2)} USDZ · ${replaced.spent.toFixed(2)} USDZ spent carried over`,
        };
        job.mandate = {
          ...job.mandate,
          mandateId: replaced.mandateId,
          version: replaced.version,
          ...(replaced.credentialFile ? { credentialFile: replaced.credentialFile } : {}),
          ...(replaced.txHash ? { txHash: replaced.txHash } : {}),
          explorerUrl: replaced.explorerUrl,
          terms: replaced.terms,
          spent: replaced.spent,
          budget: replaced.budget,
          occurrencesUsed: replaced.occurrencesUsed,
          events: [...job.mandate.events, replaceEvent],
        };
        log(
          job,
          "mandate_replaced",
          `Replaced Metal mandate (v${replaced.version}): cap ${nextMandateTerms.cap.toFixed(2)} USDZ, budget ${nextMandateTerms.budget.toFixed(2)} USDZ (${replaced.spent.toFixed(2)} USDZ spent carried over)`,
          replaced,
        );
      }
    }

    return await this.store.save(job);
  }

  /** Sandbox attack simulation: agent attempts early milestone payout at 2× the mandate cap. */
  async metalOverpayAttempt(jobId: string) {
    const job = await this.activeContractJobWithMandate(jobId);
    const mandate = job.mandate!;
    const target =
      nextMilestone(job.terms, job.releasedMilestoneIds) ??
      job.terms.milestones[job.terms.milestones.length - 1]!;
    const amountUsdz = round2(mandate.terms.cap * 2);
    const amountUsd = usdzToUsd(amountUsdz);
    const paymentId = `${job.id}-${target.id}-overpay-${mandate.events.length + 1}`;

    const res = await this.metal.payout(job, {
      milestoneId: target.id,
      amount: amountUsdz,
      to: mandate.terms.payee,
      paymentId,
    });
    const cited = explainMandateRefusal(res.reason, mandate.terms, job.terms);
    const nowIso = new Date().toISOString();

    const event: JobMandateEvent = {
      id: `mev_${randomUUID().slice(0, 8)}`,
      at: nowIso,
      kind: "refused",
      outcome: res.outcome,
      milestoneId: target.id,
      amount: amountUsdz,
      amountUsd,
      to: mandate.terms.payee,
      ...(res.reason ? { reason: res.reason } : {}),
      clause: cited.clause,
      ...(res.txHash ? { txHash: res.txHash } : {}),
      explorerUrl: res.explorerUrl ?? null,
      detail: `Refused ${amountUsdz.toFixed(2)} USDZ ($${amountUsd.toLocaleString("en-US")}) early ${target.id} payout: ${res.reason ?? "refused"} — cites ${cited.clause.clause_id}`,
    };
    mandate.events.push(event);
    log(
      job,
      "metal_refused",
      `Refused early ${target.id} payout of ${amountUsdz.toFixed(2)} USDZ ($${amountUsd.toLocaleString("en-US")}) on Metal: ${res.reason} — ${cited.headline}`,
      { ...res, clause: cited.clause },
    );
    await this.store.save(job);
    return { job, result: res, clause: cited.clause, headline: cited.headline, event };
  }

  /** Sandbox attack simulation: agent attempts payout to an unauthorized payee address. */
  async metalWrongPayeeAttempt(jobId: string) {
    const job = await this.activeContractJobWithMandate(jobId);
    const mandate = job.mandate!;
    const target =
      nextMilestone(job.terms, job.releasedMilestoneIds) ??
      job.terms.milestones[0]!;
    const wrongTo =
      this.metal.mode === "testnet" &&
      config.metal.account &&
      config.metal.account.toLowerCase() !== mandate.terms.payee.toLowerCase()
        ? config.metal.account
        : MOCK_WRONG_PAYEE_ADDRESS;
    const amountUsdz = Math.min(usdToUsdz(target.amount), mandate.terms.cap);
    const amountUsd = usdzToUsd(amountUsdz);
    const paymentId = `${job.id}-${target.id}-wrong-payee-${mandate.events.length + 1}`;

    const res = await this.metal.payout(job, {
      milestoneId: target.id,
      amount: amountUsdz,
      to: wrongTo,
      paymentId,
    });
    const cited = explainMandateRefusal(res.reason, mandate.terms, job.terms);
    const nowIso = new Date().toISOString();

    const event: JobMandateEvent = {
      id: `mev_${randomUUID().slice(0, 8)}`,
      at: nowIso,
      kind: "refused",
      outcome: res.outcome,
      milestoneId: target.id,
      amount: amountUsdz,
      amountUsd,
      to: wrongTo,
      ...(res.reason ? { reason: res.reason } : {}),
      clause: cited.clause,
      ...(res.txHash ? { txHash: res.txHash } : {}),
      explorerUrl: res.explorerUrl ?? null,
      detail: `Refused ${amountUsdz.toFixed(2)} USDZ ($${amountUsd.toLocaleString("en-US")}) to ${shortenAddress(wrongTo)}: ${res.reason ?? "refused"} — cites ${cited.clause.clause_id}`,
    };
    mandate.events.push(event);
    log(
      job,
      "metal_refused",
      `Refused ${amountUsdz.toFixed(2)} USDZ ($${amountUsd.toLocaleString("en-US")}) payout to ${shortenAddress(wrongTo)} on Metal: ${res.reason} — ${cited.headline}`,
      { ...res, clause: cited.clause, attemptedPayee: wrongTo },
    );
    await this.store.save(job);
    return {
      job,
      result: res,
      clause: cited.clause,
      headline: cited.headline,
      attemptedPayee: wrongTo,
      event,
    };
  }

  /** Verify the active Metal mandate and all recorded payouts/refusals from the chain. */
  async metalVerify(jobId: string) {
    const job = await this.store.get(jobId);
    if (!job.mandate) {
      throw new Error(`Job ${jobId} has no Metal mandate yet; approve terms first.`);
    }
    const verification = await this.metal.verify(job);
    const nowIso = new Date().toISOString();
    job.mandate.verified = {
      ok: verification.verified,
      at: nowIso,
      payments: verification.payments,
      refusals: verification.refusals,
      summary: verification.summary,
    };
    job.mandate.events.push({
      id: `mev_${randomUUID().slice(0, 8)}`,
      at: nowIso,
      kind: "verified",
      detail: verification.summary,
    });
    log(job, "mandate_verified", verification.summary, verification);
    await this.store.save(job);
    return { job, verification };
  }

  async freeze(jobId: string, frozen: boolean): Promise<Job> {
    const job = await this.activeJob(jobId);
    await this.gateway.updateCard(job.card_id!, { card_status: frozen ? "INACTIVE" : "ACTIVE" });
    log(job, "card_frozen", frozen ? "Card frozen by owner" : "Card unfrozen by owner");
    return await this.store.save(job);
  }

  async closeJob(jobId: string): Promise<Job> {
    const job = await this.activeJob(jobId);
    await this.gateway.updateCard(job.card_id!, { card_status: "CLOSED" });
    job.status = "closed";
    delete job.pending;
    delete job.activeException;
    log(job, "card_closed", "Job closed; card closed");
    return await this.store.save(job);
  }

  async listJobs(): Promise<Job[]> {
    return await this.store.list();
  }

  private async activeJob(id: string): Promise<Job> {
    const job = await this.store.get(id);
    if (job.status !== "active" || !job.card_id) throw new Error(`Job ${id} is ${job.status}; issue the card first.`);
    return job;
  }

  private async activeContractJobWithMandate(id: string): Promise<Job> {
    const job = await this.activeJob(id);
    if (job.kind === "policy") {
      throw new Error("Metal contractor mandates apply to contract jobs only.");
    }
    if (!job.mandate) {
      const terms = contractToMandateTerms(job);
      const issued = await this.metal.issueMandate(job, terms);
      job.mandate = {
        mode: this.metal.mode,
        mandateId: issued.mandateId,
        version: issued.version,
        ...(issued.credentialFile ? { credentialFile: issued.credentialFile } : {}),
        ...(issued.txHash ? { txHash: issued.txHash } : {}),
        explorerUrl: issued.explorerUrl,
        terms: issued.terms,
        spent: issued.spent,
        budget: issued.budget,
        occurrencesUsed: issued.occurrencesUsed,
        events: [],
      };
    }
    return job;
  }
}

function log(job: Job, type: JobEvent["type"], detail: string, data?: unknown) {
  job.events.push({ at: new Date().toISOString(), type, detail, data });
}

function hashFiles(files: EvidenceFile[]): string {
  const h = createHash("sha256");
  for (const f of files) h.update(f.filename).update(f.declaredKind).update(f.base64);
  return h.digest("hex");
}
