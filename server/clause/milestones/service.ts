import { createHash, randomUUID } from "node:crypto";
import type { IssuingGateway } from "../airwallex/types.js";
import { applyChangeOrder, draftChangeOrder } from "../contract/changeOrder.js";
import { parseContract, type ContractSource } from "../contract/parser.js";
import { validateTerms } from "../contract/schema.js";
import { buildCardPlan, nextMilestone } from "../policy/cardRules.js";
import { explainDecline } from "../policy/declineExplainer.js";
import type { Job, JobEvent, JobStore } from "../store/jobStore.js";
import { evaluateEvidence, type EvidenceFile } from "./evidence.js";

/**
 * The agent's state machine. Model output is only ever a *proposal* (terms, verdict, change
 * order). Every money-moving step is code, and every limit increase needs an owner approval
 * bound to the exact milestone, amount and evidence hash they saw.
 *
 *   draft --approveTerms--> active (card issued at M1 limit)
 *   active --submitProof--> pending release --approveRelease--> limit raised to next milestone
 *   active --proposeChangeOrder--> pending change --approveChangeOrder--> card re-derived
 *   active --closeJob--> closed (card CLOSED)
 */
export class ContractCardService {
  constructor(
    private readonly gateway: IssuingGateway,
    private readonly store: JobStore,
    private readonly contractorEmail: string,
  ) {}

  getJob(id: string): Job {
    return this.store.get(id);
  }

  async createJob(src: ContractSource): Promise<Job> {
    const { terms, problems, parsedBy } = await parseContract(src);
    const job: Job = {
      id: `job_${randomUUID().slice(0, 8)}`,
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
    return this.store.save(job);
  }

  /** Owner reviewed the extracted terms and clicked "Issue card". */
  async approveTerms(jobId: string): Promise<Job> {
    const job = this.store.get(jobId);
    if (job.status !== "draft") throw new Error("Terms already approved.");
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
    return this.store.save(job);
  }

  /** Sandbox-only: simulate the contractor using the card. */
  async simulateCharge(jobId: string, c: { amount: number; merchant_name: string; mcc: string; currency?: string; at?: string }) {
    const job = this.activeJob(jobId);
    const txn = await this.gateway.simulateAuthorization({
      card_id: job.card_id!,
      amount: c.amount,
      currency: c.currency ?? job.terms.currency,
      merchant_name: c.merchant_name,
      merchant_category_code: c.mcc,
      at: c.at,
    });
    const explanation = explainDecline(txn, job.rules);
    job.transactions.push({ ...txn, explanation });
    if (explanation) log(job, "charge_declined", explanation.headline, explanation);
    else log(job, "charge_approved", `Approved ${txn.currency} ${txn.amount} at ${txn.merchant_name}`);
    this.store.save(job);
    return { txn, explanation };
  }

  async submitProof(jobId: string, files: EvidenceFile[]): Promise<Job> {
    const job = this.activeJob(jobId);
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
    return this.store.save(job);
  }

  /** Owner taps Approve. The approval must match what is pending, field for field. */
  async approveRelease(jobId: string, approval: { approval_id: string; milestone_id: string; amount: number }): Promise<Job> {
    const job = this.activeJob(jobId);
    const p = job.pending;
    if (!p || p.kind !== "release_milestone") throw new Error("Nothing pending to release.");
    if (p.approval_id !== approval.approval_id || p.milestone_id !== approval.milestone_id || p.amount !== approval.amount) {
      throw new Error("Approval does not match the pending release (stale or tampered). Re-review.");
    }
    if (p.verdict?.verdict === "insufficient") throw new Error("Evidence was judged insufficient. Request new proof, or reject.");
    const released = [...job.releasedMilestoneIds, p.milestone_id!];
    const plan = buildCardPlan(job.terms, released);
    await this.gateway.updateCard(job.card_id!, { authorization_controls: plan.controls });
    Object.assign(job, { releasedMilestoneIds: released, rules: plan.rules, pending: undefined });
    log(job, "release_approved", `Released ${p.milestone_id}. Card limit now ${job.terms.currency} ${plan.releasedAmount}`, plan.controls);
    return this.store.save(job);
  }

  async rejectPending(jobId: string, reason: string): Promise<Job> {
    const job = this.activeJob(jobId);
    if (!job.pending) throw new Error("Nothing pending.");
    log(job, "release_rejected", `Owner rejected ${job.pending.kind}: ${reason}`);
    job.pending = undefined;
    return this.store.save(job);
  }

  async proposeChangeOrder(jobId: string, emailText: string): Promise<Job> {
    const job = this.activeJob(jobId);
    const co = await draftChangeOrder(job.terms, emailText);
    job.pending = { approval_id: `appr_${randomUUID().slice(0, 8)}`, kind: "change_order", currency: job.terms.currency, change_order: co, created_at: new Date().toISOString() };
    log(job, "change_order_drafted", co.summary, co);
    return this.store.save(job);
  }

  async approveChangeOrder(jobId: string, approval_id: string): Promise<Job> {
    const job = this.activeJob(jobId);
    const p = job.pending;
    if (!p || p.kind !== "change_order" || p.approval_id !== approval_id || !p.change_order) throw new Error("No matching change order pending.");
    const terms = applyChangeOrder(job.terms, p.change_order);
    const plan = buildCardPlan(terms, job.releasedMilestoneIds);
    await this.gateway.updateCard(job.card_id!, { authorization_controls: plan.controls });
    Object.assign(job, { terms, rules: plan.rules, pending: undefined });
    log(job, "change_order_approved", `Change order applied. Deadline ${terms.deadline.date}, total ${terms.currency} ${terms.total_amount}`, plan.controls);
    return this.store.save(job);
  }

  async freeze(jobId: string, frozen: boolean): Promise<Job> {
    const job = this.activeJob(jobId);
    await this.gateway.updateCard(job.card_id!, { card_status: frozen ? "INACTIVE" : "ACTIVE" });
    log(job, "card_frozen", frozen ? "Card frozen by owner" : "Card unfrozen by owner");
    return this.store.save(job);
  }

  async closeJob(jobId: string): Promise<Job> {
    const job = this.activeJob(jobId);
    await this.gateway.updateCard(job.card_id!, { card_status: "CLOSED" });
    job.status = "closed";
    log(job, "card_closed", "Job closed; card closed");
    return this.store.save(job);
  }

  private activeJob(id: string): Job {
    const job = this.store.get(id);
    if (job.status !== "active" || !job.card_id) throw new Error(`Job ${id} is ${job.status}; issue the card first.`);
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
