import { z } from "zod";

/**
 * Spend categories the model may choose from. The model NEVER emits raw MCCs: code maps
 * each label to merchant category codes in policy/mcc.ts. That keeps the card's rules
 * deterministic and auditable.
 */
export const SpendCategory = z.enum([
  "building_materials",
  "lumber",
  "hardware",
  "plumbing_supplies",
  "electrical_supplies",
  "paint_glass",
  "home_improvement_warehouse",
]);
export type SpendCategory = z.infer<typeof SpendCategory>;

/** Every term carries the clause it came from, quoted verbatim, so a decline can cite it. */
export const ClauseRef = z.object({
  clause_id: z.string(), // e.g. "§2.1"
  quote: z.string(), // verbatim clause text
});
export type ClauseRef = z.infer<typeof ClauseRef>;

export const EvidenceKind = z.enum(["photos", "inspection_report", "invoice", "walkthrough_signoff"]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const Milestone = z.object({
  id: z.string(), // "M1"
  name: z.string(),
  amount: z.number().positive(), // major units
  release_condition: z.string(),
  evidence_required: z.array(EvidenceKind),
  released_on_signing: z.boolean(),
  clause: ClauseRef,
});
export type Milestone = z.infer<typeof Milestone>;

export const ContractTerms = z.object({
  contract_ref: z.string(),
  contractor_name: z.string(),
  client_name: z.string(),
  project: z.string(),
  currency: z.string().length(3),
  total_amount: z.number().positive(),
  milestones: z.array(Milestone).min(1),
  allowed_spend: z.object({ categories: z.array(SpendCategory).min(1), clause: ClauseRef }),
  prohibited_spend: z.object({ description: z.string(), clause: ClauseRef }).optional(),
  start_date: z.string().optional(), // YYYY-MM-DD
  deadline: z.object({ date: z.string(), clause: ClauseRef }), // last day funds may be drawn
  change_order_clause: ClauseRef.optional(),
  /** Anything ambiguous the model wants a human to look at before a card is issued. */
  open_questions: z.array(z.string()).default([]),
});
export type ContractTerms = z.infer<typeof ContractTerms>;

/** Deterministic sanity checks the model's output must pass before any card exists. */
export function validateTerms(t: ContractTerms): string[] {
  const problems: string[] = [];
  const sum = t.milestones.reduce((s, m) => s + m.amount, 0);
  if (Math.abs(sum - t.total_amount) > 0.005) problems.push(`Milestones sum to ${sum}, contract total is ${t.total_amount}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.deadline.date)) problems.push(`Deadline "${t.deadline.date}" is not YYYY-MM-DD.`);
  if (t.start_date && t.start_date > t.deadline.date) problems.push("Start date is after the deadline.");
  const ids = new Set(t.milestones.map((m) => m.id));
  if (ids.size !== t.milestones.length) problems.push("Duplicate milestone ids.");
  if (!t.milestones[0]?.released_on_signing) problems.push("First milestone is not released on signing; no opening card limit.");
  return problems;
}
