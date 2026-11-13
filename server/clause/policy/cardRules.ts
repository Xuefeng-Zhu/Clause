import type { AuthorizationControls, DeclineReason } from "../airwallex/types.js";
import type { ClauseRef, ContractTerms } from "../contract/schema.js";
import type { PolicyTerms } from "../expense/schema.js";
import { mccsFor, policyMccsFor } from "./mcc.js";

/**
 * Deterministic translation: contract terms + which milestones are released -> card controls.
 * Each rule remembers the clause it came from, so a decline can quote it.
 * The model never calls this with numbers of its own; it only produced `terms` (validated)
 * and the owner approved them.
 */
export interface CardRule {
  control: "limit" | "per_transaction_limit" | "merchant_categories" | "time_window" | "currency";
  description: string;
  value: string;
  clause: ClauseRef;
  /** Decline codes this rule produces when it blocks a charge. */
  declines: DeclineReason[];
}

export interface CardPlan {
  controls: AuthorizationControls;
  rules: CardRule[];
  releasedAmount: number;
}

/** End of the deadline day in the job's timezone, as ISO UTC. */
export function deadlineToActiveTo(date: string, utcOffset = "-08:00"): string {
  return new Date(`${date}T23:59:59${utcOffset}`).toISOString();
}

export function buildCardPlan(
  terms: ContractTerms,
  releasedMilestoneIds: string[],
  opts: { activeFrom?: string; utcOffset?: string } = {},
): CardPlan {
  const released = terms.milestones.filter((m) => releasedMilestoneIds.includes(m.id));
  if (!released.length) throw new Error("No milestone released yet; refusing to create a card with a zero limit.");
  const releasedAmount = round2(released.reduce((s, m) => s + m.amount, 0));
  const lastReleased = released[released.length - 1]!;
  const mccs = mccsFor(terms.allowed_spend.categories);
  const activeTo = deadlineToActiveTo(terms.deadline.date, opts.utcOffset);

  const controls: AuthorizationControls = {
    allowed_currencies: [terms.currency],
    allowed_merchant_categories: mccs,
    allowed_transaction_count: "MULTIPLE",
    transaction_limits: {
      currency: terms.currency,
      // ALL_TIME = cumulative cap across every released milestone. (PER_TRANSACTION isn't cumulative.)
      limits: [{ amount: releasedAmount, interval: "ALL_TIME" }],
    },
    ...(opts.activeFrom ? { active_from: opts.activeFrom } : {}),
    active_to: activeTo,
  };

  const rules: CardRule[] = [
    {
      control: "limit",
      description: `Total spend capped at released milestones (${released.map((m) => m.id).join(" + ")})`,
      value: `${terms.currency} ${releasedAmount.toLocaleString("en-US")}`,
      clause: lastReleased.clause,
      declines: ["LIMIT_EXCEEDED"],
    },
    {
      control: "merchant_categories",
      description: "Only building-supply merchants",
      value: mccs.join(", "),
      clause: terms.allowed_spend.clause,
      declines: ["MERCHANT_CATEGORY_NOT_ALLOWED"],
    },
    {
      control: "time_window",
      description: "Card stops working after the contract deadline",
      value: `until ${terms.deadline.date} 23:59 (${opts.utcOffset ?? "-08:00"})`,
      clause: terms.deadline.clause,
      declines: ["OUT_OF_ALLOWED_TIME_RANGE"],
    },
    {
      control: "currency",
      description: "Contract currency only",
      value: terms.currency,
      clause: { clause_id: "Header", quote: `Total contract price: ${terms.currency} ${terms.total_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}` },
      declines: ["CURRENCY_NOT_ALLOWED"],
    },
  ];
  return { controls, rules, releasedAmount };
}

export function nextMilestone(terms: ContractTerms, releasedIds: string[]) {
  return terms.milestones.find((m) => !releasedIds.includes(m.id));
}

export function buildPolicyCardPlan(
  terms: PolicyTerms,
  opts: {
    perTransactionCapOverride?: number;
    perTransactionClauseOverride?: ClauseRef;
    utcOffset?: string;
  } = {},
): CardPlan {
  const budgetAmount = round2(terms.budget.amount);
  const perChargeAmount = round2(opts.perTransactionCapOverride ?? terms.per_charge_cap.amount);
  if (budgetAmount <= 0) throw new Error("Trip budget must be positive.");
  if (perChargeAmount <= 0) throw new Error("Per-transaction cap must be positive.");

  const mccs = policyMccsFor(terms.allowed_spend.categories);
  const activeTo = deadlineToActiveTo(terms.card_expires.date, opts.utcOffset);

  const controls: AuthorizationControls = {
    allowed_currencies: [terms.currency],
    allowed_merchant_categories: mccs,
    allowed_transaction_count: "MULTIPLE",
    transaction_limits: {
      currency: terms.currency,
      limits: [
        { amount: perChargeAmount, interval: "PER_TRANSACTION" },
        { amount: budgetAmount, interval: "ALL_TIME" },
      ],
    },
    active_to: activeTo,
  };

  const perChargeClause = opts.perTransactionClauseOverride ?? terms.per_charge_cap.clause;
  const perChargeDesc =
    opts.perTransactionCapOverride !== undefined
      ? `One-time approved exception up to ${terms.currency} ${perChargeAmount.toLocaleString("en-US")}`
      : `Single charge capped at ${terms.currency} ${perChargeAmount.toLocaleString("en-US")}`;

  const rules: CardRule[] = [
    {
      control: "limit",
      description: "Total trip spend capped at approved budget",
      value: `${terms.currency} ${budgetAmount.toLocaleString("en-US")}`,
      clause: terms.budget.clause,
      declines: ["LIMIT_EXCEEDED"],
    },
    {
      control: "per_transaction_limit",
      description: perChargeDesc,
      value: `${terms.currency} ${perChargeAmount.toLocaleString("en-US")}`,
      clause: perChargeClause,
      declines: ["LIMIT_EXCEEDED"],
    },
    {
      control: "merchant_categories",
      description: "Only approved travel & expense categories",
      value: mccs.join(", "),
      clause: terms.allowed_spend.clause,
      declines: ["MERCHANT_CATEGORY_NOT_ALLOWED"],
    },
    {
      control: "time_window",
      description: "Card expires 48 hours after scheduled return",
      value: `until ${terms.card_expires.date} 23:59 (${opts.utcOffset ?? "-08:00"})`,
      clause: terms.card_expires.clause,
      declines: ["OUT_OF_ALLOWED_TIME_RANGE"],
    },
    {
      control: "currency",
      description: "Trip currency only",
      value: terms.currency,
      clause: {
        clause_id: "Header",
        quote: `Approved budget: ${terms.currency} ${budgetAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      },
      declines: ["CURRENCY_NOT_ALLOWED"],
    },
  ];

  return { controls, rules, releasedAmount: budgetAmount };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
