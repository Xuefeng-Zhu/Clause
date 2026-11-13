import type { ClauseRef, ContractTerms } from "../contract/schema.js";
import { deadlineToActiveTo } from "../policy/cardRules.js";

/** Testnet scale factor: $1,200.00 USD -> 12.00 *USDZ so testnet payouts stay small. */
export const USDZ_PER_USD = 0.01;

/** Minimum on-chain mandate validity window (1 day in seconds). */
export const MIN_MANDATE_EXPIRES_IN_SECONDS = 86_400;

/** Deterministic stand-in addresses when running in mock mode without Metal keys. */
export const MOCK_CONTRACTOR_ADDRESS = "0xC0ffee0000000000000000000000000000000412";
export const MOCK_WRONG_PAYEE_ADDRESS = "0xDead00000000000000000000000000000000BEEF";

export type MetalMode = "mock" | "testnet";

export type MandateRefusalReason =
  | "mandate_cap_exceeded"
  | "mandate_payee_not_listed"
  | "mandate_budget_spent"
  | "mandate_occurrences_used"
  | "mandate_expired"
  | "mandate_revoked";

export interface MandateClauseRefs {
  payee: ClauseRef;
  cap: ClauseRef;
  budget: ClauseRef;
  maxOccurrences: ClauseRef;
  expiresIn: ClauseRef;
}

export interface MandateTerms {
  payee: string;
  payeeName: string;
  /** Largest single milestone payout in *USDZ (USD * USDZ_PER_USD). */
  cap: number;
  /** Largest single milestone payout in contract currency (USD). */
  capUsd: number;
  /** Total contract budget in *USDZ (total_amount * USDZ_PER_USD). */
  budget: number;
  /** Total contract value in contract currency (USD). */
  budgetUsd: number;
  scale: number;
  maxOccurrences: number;
  /** Seconds from issuance until contract deadline cutoff (minimum 86,400s = 1 day). */
  expiresIn: number;
  /** ISO-8601 expiry timestamp corresponding to issuance + expiresIn. */
  expiresAt: string;
  deadlineDate: string;
  description: string;
  clauses: MandateClauseRefs;
}

export interface MandatePayoutRequest {
  milestoneId: string;
  /** Payout amount in *USDZ. */
  amount: number;
  to: string;
  paymentId: string;
  /** Mock-only optional timestamp override for deterministic expiry tests. */
  at?: string;
}

export interface MandatePayoutResult {
  outcome: "paid" | "refused" | "pending";
  reason?: MandateRefusalReason | string;
  reasonDetail?: string;
  txHash?: string;
  explorerUrl?: string | null;
  spent?: number;
  budget?: number;
  occurrencesUsed?: number;
}

export interface MandateIssueResult {
  mandateId: string;
  version: number;
  credentialFile?: string;
  txHash?: string;
  explorerUrl: string | null;
  terms: MandateTerms;
  spent: number;
  budget: number;
  occurrencesUsed: number;
}

export interface MandateStatusResult {
  mandateId: string;
  bound: boolean;
  revoked: boolean;
  spent: number;
  budget: number;
  occurrencesUsed: number;
  maxOccurrences: number;
  cap: number;
  payee: string;
  expiresAt?: string;
}

export interface MandateVerifyResult {
  verified: boolean;
  mandateId?: string;
  payments: number;
  refusals: number;
  summary: string;
}

export interface JobMandateEvent {
  id: string;
  at: string;
  kind: "issued" | "payout" | "refused" | "replaced" | "verified";
  outcome?: "paid" | "refused" | "pending";
  milestoneId?: string;
  amount?: number;
  amountUsd?: number;
  to?: string;
  reason?: MandateRefusalReason | string;
  clause?: ClauseRef;
  txHash?: string;
  explorerUrl?: string | null;
  depositId?: string;
  detail: string;
}

export interface JobMandateState {
  mode: MetalMode;
  mandateId: string;
  version: number;
  credentialFile?: string;
  txHash?: string;
  explorerUrl: string | null;
  terms: MandateTerms;
  spent: number;
  budget: number;
  occurrencesUsed: number;
  revoked?: boolean;
  verified?: {
    ok: boolean;
    at: string;
    payments: number;
    refusals: number;
    summary: string;
  };
  events: JobMandateEvent[];
}

export interface JobWithMandateRef {
  id: string;
  terms: ContractTerms;
  mandate?: JobMandateState;
}

export interface MetalRail {
  readonly mode: MetalMode;
  issueMandate(job: JobWithMandateRef, terms: MandateTerms): Promise<MandateIssueResult>;
  payout(job: JobWithMandateRef, req: MandatePayoutRequest): Promise<MandatePayoutResult>;
  replaceMandate(job: JobWithMandateRef, newTerms: MandateTerms): Promise<MandateIssueResult>;
  status(job: JobWithMandateRef): Promise<MandateStatusResult>;
  verify(job: JobWithMandateRef): Promise<MandateVerifyResult>;
  reset?(): void;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function usdToUsdz(usd: number): number {
  return round2(usd * USDZ_PER_USD);
}

export function usdzToUsd(usdz: number): number {
  return round2(usdz / USDZ_PER_USD);
}

export function shortenAddress(addr: string): string {
  const clean = addr.trim();
  if (clean.length <= 12) return clean;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}

/**
 * Pure deterministic translation: contract terms -> on-chain Metal mandate limits.
 * Every limit retains the exact contract clause reference it came from so refusals cite it.
 */
export function contractToMandateTerms(
  job: Pick<JobWithMandateRef, "id" | "terms">,
  opts: {
    payee?: string;
    nowMs?: number;
    utcOffset?: string;
  } = {},
): MandateTerms {
  const { terms } = job;
  if (!terms.milestones.length) {
    throw new Error("Cannot derive Metal mandate terms: contract has no milestones.");
  }

  const envPayee = process.env.METAL_CONTRACTOR_ADDRESS?.trim(); // guard:allow-no-env-credentials — public contractor wallet address for Metal testnet payouts
  const payee = opts.payee?.trim() || envPayee || MOCK_CONTRACTOR_ADDRESS;

  const largestMilestone = terms.milestones.reduce((best, m) =>
    m.amount > best.amount ? m : best,
  );
  const firstMilestone = terms.milestones[0]!;
  const lastMilestone = terms.milestones[terms.milestones.length - 1]!;
  const changeOrderMilestone = terms.milestones.find(
    (m) => m.clause.clause_id.toLowerCase() === "change order",
  );

  const capUsd = round2(largestMilestone.amount);
  const cap = usdToUsdz(capUsd);
  const budgetUsd = round2(terms.total_amount);
  const budget = usdToUsdz(budgetUsd);
  const maxOccurrences = terms.milestones.length;

  const nowMs = opts.nowMs ?? Date.now();
  const activeToIso = deadlineToActiveTo(terms.deadline.date, opts.utcOffset);
  const rawSeconds = Math.floor((Date.parse(activeToIso) - nowMs) / 1000);
  const expiresIn = Math.max(
    MIN_MANDATE_EXPIRES_IN_SECONDS,
    Number.isFinite(rawSeconds) ? rawSeconds : MIN_MANDATE_EXPIRES_IN_SECONDS,
  );
  const expiresAt = new Date(nowMs + expiresIn * 1000).toISOString();

  const contractId = terms.contract_ref || job.id;
  const description = `Clause ${terms.project} — contract ${contractId}`;

  const budgetClause: ClauseRef = changeOrderMilestone
    ? changeOrderMilestone.clause
    : {
        clause_id: firstMilestone.clause.clause_id,
        quote: `Total contract price: ${terms.currency} ${budgetUsd.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} across ${maxOccurrences} milestone(s).`,
      };

  const payeeClause: ClauseRef = {
    clause_id: firstMilestone.clause.clause_id,
    quote: `Contractor: ${terms.contractor_name} (${contractId}) — ${firstMilestone.clause.quote}`,
  };

  return {
    payee,
    payeeName: terms.contractor_name || "Contractor",
    cap,
    capUsd,
    budget,
    budgetUsd,
    scale: USDZ_PER_USD,
    maxOccurrences,
    expiresIn,
    expiresAt,
    deadlineDate: terms.deadline.date,
    description,
    clauses: {
      payee: payeeClause,
      cap: largestMilestone.clause,
      budget: budgetClause,
      maxOccurrences: lastMilestone.clause,
      expiresIn: terms.deadline.clause,
    },
  };
}

export function explainMandateRefusal(
  reason: MandateRefusalReason | string | undefined,
  mandateTerms: MandateTerms,
  contractTerms?: ContractTerms,
): { clause: ClauseRef; headline: string } {
  switch (reason) {
    case "mandate_cap_exceeded":
      return {
        clause: mandateTerms.clauses.cap,
        headline: `Exceeds per-payout mandate cap of ${mandateTerms.cap.toFixed(2)} USDZ ($${mandateTerms.capUsd.toLocaleString("en-US")}) from ${mandateTerms.clauses.cap.clause_id}`,
      };
    case "mandate_payee_not_listed":
      return {
        clause: mandateTerms.clauses.payee,
        headline: `Payee is not the contracted recipient ${shortenAddress(mandateTerms.payee)} (${mandateTerms.clauses.payee.clause_id})`,
      };
    case "mandate_budget_spent":
      return {
        clause: mandateTerms.clauses.budget,
        headline: `Exceeds total contract mandate budget of ${mandateTerms.budget.toFixed(2)} USDZ ($${mandateTerms.budgetUsd.toLocaleString("en-US")}) (${mandateTerms.clauses.budget.clause_id})`,
      };
    case "mandate_occurrences_used":
      return {
        clause: mandateTerms.clauses.maxOccurrences,
        headline: `All ${mandateTerms.maxOccurrences} milestone payouts permitted by ${mandateTerms.clauses.maxOccurrences.clause_id} have been used`,
      };
    case "mandate_expired":
      return {
        clause: mandateTerms.clauses.expiresIn,
        headline: `Mandate expired after contract completion cutoff ${mandateTerms.deadlineDate} (${mandateTerms.clauses.expiresIn.clause_id})`,
      };
    case "mandate_revoked": {
      const clause = contractTerms?.change_order_clause ?? mandateTerms.clauses.budget;
      return {
        clause,
        headline: `Mandate was revoked (${clause.clause_id})`,
      };
    }
    default:
      return {
        clause: mandateTerms.clauses.budget,
        headline: `Refused by Metal mandate (${reason ?? "unknown_reason"})`,
      };
  }
}
