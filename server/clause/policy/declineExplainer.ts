import type { IssuingTransaction } from "../airwallex/types.js";
import type { CardRule } from "./cardRules.js";
import { DEMO_MCC_NAMES } from "./mcc.js";

export interface DeclineExplanation {
  transaction_id: string;
  failure_reason: string;
  headline: string;
  clause_id?: string;
  clause_quote?: string;
}

/**
 * Pure code, no model: map an Airwallex decline code back to the rule (and clause) that set it.
 * Declines we didn't author (INSUFFICIENT_FUNDS, CARD_INACTIVE...) are labeled as such.
 */
export function explainDecline(txn: IssuingTransaction, rules: CardRule[]): DeclineExplanation | undefined {
  if (!txn.failure_reason) return undefined;
  const rule = rules.find((r) => r.declines.includes(txn.failure_reason!));
  const merchant = `${txn.merchant_name} (${DEMO_MCC_NAMES[txn.merchant_category_code] ?? "MCC " + txn.merchant_category_code})`;
  const amount = `${txn.currency} ${txn.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const headline = (() => {
    switch (txn.failure_reason) {
      case "MERCHANT_CATEGORY_NOT_ALLOWED":
        return `Declined ${amount} at ${merchant}: not a building-supply merchant.`;
      case "OUT_OF_ALLOWED_TIME_RANGE":
        return `Declined ${amount} at ${merchant}: the contract deadline has passed.`;
      case "LIMIT_EXCEEDED":
        return `Declined ${amount} at ${merchant}: it would exceed the funds released so far.`;
      case "CURRENCY_NOT_ALLOWED":
        return `Declined ${amount} at ${merchant}: not the contract currency.`;
      case "CARD_INACTIVE":
        return `Declined ${amount}: the card is frozen.`;
      case "CARD_CLOSED":
        return `Declined ${amount}: the card is closed.`;
      case "INSUFFICIENT_FUNDS":
        return `Declined ${amount}: the business wallet is short. This is not a contract rule.`;
      default:
        return `Declined ${amount}: ${txn.failure_reason}.`;
    }
  })();
  return {
    transaction_id: txn.transaction_id,
    failure_reason: txn.failure_reason,
    headline,
    ...(rule?.clause.clause_id !== undefined ? { clause_id: rule.clause.clause_id } : {}),
    ...(rule?.clause.quote !== undefined ? { clause_quote: rule.clause.quote } : {}),
  };
}
