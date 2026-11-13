import { createHash } from "node:crypto";
import {
  type JobWithMandateRef,
  type MandateIssueResult,
  type MandatePayoutRequest,
  type MandatePayoutResult,
  type MandateRefusalReason,
  type MandateStatusResult,
  type MandateTerms,
  type MandateVerifyResult,
  type MetalRail,
  round2,
} from "./types.js";

interface MockMandateRecord {
  mandateId: string;
  version: number;
  terms: MandateTerms;
  revoked: boolean;
  spent: number;
  occurrencesUsed: number;
  payments: number;
  refusals: number;
  paidIds: Map<string, MandatePayoutResult>;
}

function deterministicHex(seed: string): string {
  return `0x${createHash("sha256").update(seed).digest("hex")}`;
}

/**
 * Deterministic in-memory stand-in for Metal testnet mandates.
 * Enforces payee allowlist, per-payout cap, total budget, max occurrences, expiry, and revocation,
 * returning the exact same refusal reason codes as the Metal account contract.
 */
export class MockMetalRail implements MetalRail {
  readonly mode = "mock" as const;
  private records = new Map<string, MockMandateRecord>();

  reset(): void {
    this.records.clear();
  }

  /** Test helper to revoke a job's mock mandate directly so mandate_revoked can be verified. */
  revokeForTest(jobId: string): void {
    const rec = this.records.get(jobId);
    if (rec) rec.revoked = true;
  }

  private ensureRecord(job: JobWithMandateRef): MockMandateRecord {
    const existing = this.records.get(job.id);
    if (existing) return existing;
    if (job.mandate) {
      const payments = job.mandate.events.filter((e) => e.outcome === "paid").length;
      const refusals = job.mandate.events.filter((e) => e.outcome === "refused").length;
      const hydrated: MockMandateRecord = {
        mandateId: job.mandate.mandateId,
        version: job.mandate.version,
        terms: structuredClone(job.mandate.terms),
        revoked: Boolean(job.mandate.revoked),
        spent: job.mandate.spent,
        occurrencesUsed: job.mandate.occurrencesUsed,
        payments: Math.max(payments, job.mandate.occurrencesUsed),
        refusals,
        paidIds: new Map(),
      };
      this.records.set(job.id, hydrated);
      return hydrated;
    }
    throw new Error(`No Metal mandate issued for job ${job.id}`);
  }

  async issueMandate(job: JobWithMandateRef, terms: MandateTerms): Promise<MandateIssueResult> {
    const mandateId = deterministicHex(`mandate:${job.id}:v1:${terms.description}`);
    const txHash = deterministicHex(`bind:${job.id}:v1:${mandateId}`);
    const rec: MockMandateRecord = {
      mandateId,
      version: 1,
      terms: structuredClone(terms),
      revoked: false,
      spent: 0,
      occurrencesUsed: 0,
      payments: 0,
      refusals: 0,
      paidIds: new Map(),
    };
    this.records.set(job.id, rec);
    return {
      mandateId,
      version: 1,
      txHash,
      explorerUrl: null,
      terms: structuredClone(terms),
      spent: 0,
      budget: terms.budget,
      occurrencesUsed: 0,
    };
  }

  async payout(job: JobWithMandateRef, req: MandatePayoutRequest): Promise<MandatePayoutResult> {
    const rec = this.ensureRecord(job);

    // Idempotent replay of an already-settled paymentId under the same mandate
    const prior = rec.paidIds.get(req.paymentId);
    if (prior) return structuredClone(prior);

    const refusal = this.checkRefusal(rec, req);
    if (refusal) {
      rec.refusals += 1;
      return {
        outcome: "refused",
        reason: refusal,
        explorerUrl: null,
        spent: rec.spent,
        budget: rec.terms.budget,
        occurrencesUsed: rec.occurrencesUsed,
      };
    }

    const amount = round2(req.amount);
    rec.spent = round2(rec.spent + amount);
    rec.occurrencesUsed += 1;
    rec.payments += 1;
    const txHash = deterministicHex(`pull:${job.id}:v${rec.version}:${req.paymentId}:${rec.payments}`);

    const paidResult: MandatePayoutResult = {
      outcome: "paid",
      txHash,
      explorerUrl: null,
      spent: rec.spent,
      budget: rec.terms.budget,
      occurrencesUsed: rec.occurrencesUsed,
    };
    rec.paidIds.set(req.paymentId, paidResult);
    return structuredClone(paidResult);
  }

  async replaceMandate(job: JobWithMandateRef, newTerms: MandateTerms): Promise<MandateIssueResult> {
    const prev = this.ensureRecord(job);
    const nextVersion = prev.version + 1;
    const mandateId = deterministicHex(`mandate:${job.id}:v${nextVersion}:${newTerms.description}`);
    const txHash = deterministicHex(`replace:${job.id}:v${nextVersion}:${mandateId}`);

    const replaced: MockMandateRecord = {
      mandateId,
      version: nextVersion,
      terms: structuredClone(newTerms),
      revoked: false,
      spent: prev.spent, // spend carries over into the new budget
      occurrencesUsed: prev.occurrencesUsed,
      payments: prev.payments,
      refusals: prev.refusals,
      paidIds: new Map(),
    };
    this.records.set(job.id, replaced);

    return {
      mandateId,
      version: nextVersion,
      txHash,
      explorerUrl: null,
      terms: structuredClone(newTerms),
      spent: replaced.spent,
      budget: newTerms.budget,
      occurrencesUsed: replaced.occurrencesUsed,
    };
  }

  async status(job: JobWithMandateRef): Promise<MandateStatusResult> {
    const rec = this.ensureRecord(job);
    return {
      mandateId: rec.mandateId,
      bound: true,
      revoked: rec.revoked,
      spent: rec.spent,
      budget: rec.terms.budget,
      occurrencesUsed: rec.occurrencesUsed,
      maxOccurrences: rec.terms.maxOccurrences,
      cap: rec.terms.cap,
      payee: rec.terms.payee,
      expiresAt: rec.terms.expiresAt,
    };
  }

  async verify(job: JobWithMandateRef): Promise<MandateVerifyResult> {
    const rec = this.ensureRecord(job);
    const verified = !rec.revoked;
    const summary = verified
      ? `Verified on chain ✓ — ${rec.payments} payments, ${rec.refusals} refusals`
      : `Mandate revoked — ${rec.payments} payments, ${rec.refusals} refusals`;
    return {
      verified,
      mandateId: rec.mandateId,
      payments: rec.payments,
      refusals: rec.refusals,
      summary,
    };
  }

  private checkRefusal(rec: MockMandateRecord, req: MandatePayoutRequest): MandateRefusalReason | undefined {
    if (rec.revoked) return "mandate_revoked";

    const nowMs = req.at ? Date.parse(req.at) : Date.now();
    const expiresMs = Date.parse(rec.terms.expiresAt);
    if (!Number.isNaN(nowMs) && !Number.isNaN(expiresMs) && nowMs > expiresMs) {
      return "mandate_expired";
    }

    if (req.to.trim().toLowerCase() !== rec.terms.payee.trim().toLowerCase()) {
      return "mandate_payee_not_listed";
    }

    if (rec.occurrencesUsed >= rec.terms.maxOccurrences) {
      return "mandate_occurrences_used";
    }

    const amount = round2(req.amount);
    if (amount > round2(rec.terms.cap)) {
      return "mandate_cap_exceeded";
    }

    if (round2(rec.spent + amount) > round2(rec.terms.budget)) {
      return "mandate_budget_spent";
    }

    return undefined;
  }
}
