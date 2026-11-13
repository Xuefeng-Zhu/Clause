import { z } from "zod";
import { ClauseRef, type ContractTerms } from "../contract/schema.js";

/**
 * Expense policy spend categories. Mapped deterministically to MCCs in policy/mcc.ts;
 * the model never emits raw MCC numbers.
 */
export const PolicySpendCategory = z.enum([
  "lodging",
  "airfare",
  "ground_transport",
  "meals",
]);
export type PolicySpendCategory = z.infer<typeof PolicySpendCategory>;

export const ProhibitedPolicyRule = z.object({
  description: z.string(),
  clause: ClauseRef,
});
export type ProhibitedPolicyRule = z.infer<typeof ProhibitedPolicyRule>;

export const PolicyTerms = z.object({
  policy_ref: z.string(), // e.g. "TR-2611"
  company: z.string(), // "Acme Robotics Inc."
  traveler: z.string(), // "Priya Shah"
  traveler_email: z.string().optional(),
  approver: z.string(), // "Marcus Lee"
  purpose: z.string(),
  currency: z.string().length(3),
  budget: z.object({ amount: z.number().positive(), clause: ClauseRef }),
  per_charge_cap: z.object({ amount: z.number().positive(), clause: ClauseRef }),
  lodging_clause: ClauseRef.optional(),
  allowed_spend: z.object({
    categories: z.array(PolicySpendCategory).min(1),
    clause: ClauseRef,
  }),
  prohibited_spend: z.array(ProhibitedPolicyRule).default([]),
  trip_start: z.string(), // YYYY-MM-DD
  trip_end: z.string(), // YYYY-MM-DD
  card_expires: z.object({ date: z.string(), clause: ClauseRef }), // trip_end + 48h -> YYYY-MM-DD
  exception_clause: z
    .object({
      per_attendee_cap: z.number().positive(),
      clause: ClauseRef,
    })
    .optional(),
  open_questions: z.array(z.string()).default([]),
});
export type PolicyTerms = z.infer<typeof PolicyTerms>;

export function addDaysIso(isoDate: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** Deterministic sanity checks on extracted PolicyTerms before issuing a trip card. */
export function validatePolicyTerms(t: PolicyTerms): string[] {
  const problems: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.trip_start)) {
    problems.push(`Trip start "${t.trip_start}" is not YYYY-MM-DD.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.trip_end)) {
    problems.push(`Trip end "${t.trip_end}" is not YYYY-MM-DD.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.card_expires.date)) {
    problems.push(`Card expiry "${t.card_expires.date}" is not YYYY-MM-DD.`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t.trip_start) && /^\d{4}-\d{2}-\d{2}$/.test(t.trip_end) && t.trip_start > t.trip_end) {
    problems.push("Trip start date is after the return date.");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t.trip_end) && /^\d{4}-\d{2}-\d{2}$/.test(t.card_expires.date) && t.card_expires.date < t.trip_end) {
    problems.push("Card expiry is before the scheduled return date.");
  }
  if (t.per_charge_cap.amount > t.budget.amount) {
    problems.push(`Single-charge cap (${t.per_charge_cap.amount}) exceeds total trip budget (${t.budget.amount}).`);
  }
  return problems;
}

/**
 * Compatibility projection so existing code paths reading `job.terms` remain non-null and typed,
 * while policy-aware paths read `job.policyTerms` directly when `job.kind === "policy"`.
 */
export function synthesizeContractTermsFromPolicy(pt: PolicyTerms): ContractTerms {
  const combinedProhibited = pt.prohibited_spend[0];
  return {
    contract_ref: pt.policy_ref,
    contractor_name: pt.traveler,
    client_name: pt.company,
    project: pt.purpose,
    currency: pt.currency,
    total_amount: pt.budget.amount,
    milestones: [
      {
        id: "TRIP",
        name: "Approved trip budget",
        amount: pt.budget.amount,
        release_condition: `Approved by ${pt.approver}`,
        evidence_required: [],
        released_on_signing: true,
        clause: pt.budget.clause,
      },
    ],
    allowed_spend: {
      categories: ["building_materials"],
      clause: pt.allowed_spend.clause,
    },
    ...(combinedProhibited
      ? {
          prohibited_spend: {
            description: pt.prohibited_spend.map((p) => p.description).join(" "),
            clause: combinedProhibited.clause,
          },
        }
      : {}),
    start_date: pt.trip_start,
    deadline: pt.card_expires,
    ...(pt.exception_clause ? { change_order_clause: pt.exception_clause.clause } : {}),
    open_questions: [...pt.open_questions],
  };
}
