import type { IssuingTransaction } from "../airwallex/types.js";
import type { ClauseRef } from "../contract/schema.js";
import type { PolicyTerms } from "../expense/schema.js";
import type { CardRule } from "./cardRules.js";
import { DEMO_MCC_NAMES, POLICY_PROHIBITED_MCCS, PROHIBITED_MCCS } from "./mcc.js";

export interface DeclineExplanation {
  transaction_id: string;
  failure_reason: string;
  headline: string;
  clause_id?: string;
  clause_quote?: string;
  /** True when the charge hit the contract's or policy's explicit prohibited-spend clause. */
  prohibited?: boolean;
  /** True when a per-charge cap decline on a policy card can request a §3.4 manager exception. */
  can_request_exception?: boolean;
}

/**
 * Pure code, no model: map an Airwallex decline code back to the rule (and clause) that set it.
 * Declines we didn't author (INSUFFICIENT_FUNDS, CARD_INACTIVE...) are labeled as such.
 */
export function explainDecline(
  txn: IssuingTransaction,
  rules: CardRule[],
  prohibited?: { description: string; clause: ClauseRef },
  policy?: { terms: PolicyTerms; activePerChargeCap?: number },
): DeclineExplanation | undefined {
  if (!txn.failure_reason) return undefined;
  if (policy) {
    return explainPolicyDecline(txn, rules, policy.terms, policy.activePerChargeCap);
  }
  const prohibitedKind =
    txn.failure_reason === "MERCHANT_CATEGORY_NOT_ALLOWED" && prohibited
      ? PROHIBITED_MCCS[txn.merchant_category_code]
      : undefined;
  const rule = prohibitedKind
    ? { clause: prohibited!.clause }
    : rules.find((r) => r.declines.includes(txn.failure_reason!));
  const merchant = `${txn.merchant_name} (${DEMO_MCC_NAMES[txn.merchant_category_code] ?? "MCC " + txn.merchant_category_code})`;
  const amount = `${txn.currency} ${txn.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const headline = (() => {
    switch (txn.failure_reason) {
      case "MERCHANT_CATEGORY_NOT_ALLOWED":
        if (prohibitedKind) return `Declined ${amount} at ${merchant}: the contract prohibits spending on ${prohibitedKind}.`;
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
    ...(prohibitedKind ? { prohibited: true } : {}),
  };
}

/**
 * Pure deterministic decline mapping for travel & expense policy cards:
 * - Prohibited MCC -> §4.1 (electronics/gift cards) or §4.2 (bars/nightclubs)
 * - LIMIT_EXCEEDED with amount > per_charge_cap -> §3.3 (+ "Request an exception (§3.4)" prompt)
 * - LIMIT_EXCEEDED by cumulative budget -> §2.2
 * - OUT_OF_ALLOWED_TIME_RANGE -> §2.1
 */
export function explainPolicyDecline(
  txn: IssuingTransaction,
  rules: CardRule[],
  terms: PolicyTerms,
  activePerChargeCap = terms.per_charge_cap.amount,
): DeclineExplanation | undefined {
  if (!txn.failure_reason) return undefined;

  const merchant = `${txn.merchant_name} (${DEMO_MCC_NAMES[txn.merchant_category_code] ?? "MCC " + txn.merchant_category_code})`;
  const amount = `${txn.currency} ${txn.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  if (txn.failure_reason === "MERCHANT_CATEGORY_NOT_ALLOWED") {
    const mapped = POLICY_PROHIBITED_MCCS[txn.merchant_category_code];
    if (mapped) {
      const matchedRule = terms.prohibited_spend.find((p) => p.clause.clause_id === mapped.clauseId);
      const clause = matchedRule?.clause ?? {
        clause_id: mapped.clauseId,
        quote: mapped.kind,
      };
      return {
        transaction_id: txn.transaction_id,
        failure_reason: txn.failure_reason,
        headline: `Declined ${amount} at ${merchant}: policy prohibits ${mapped.kind} (${clause.clause_id}).`,
        clause_id: clause.clause_id,
        clause_quote: clause.quote,
        prohibited: true,
      };
    }
    const allowedClause = terms.allowed_spend.clause;
    return {
      transaction_id: txn.transaction_id,
      failure_reason: txn.failure_reason,
      headline: `Declined ${amount} at ${merchant}: merchant category is not in allowed travel spend (${allowedClause.clause_id}).`,
      clause_id: allowedClause.clause_id,
      clause_quote: allowedClause.quote,
    };
  }

  if (txn.failure_reason === "LIMIT_EXCEEDED") {
    if (txn.amount > activePerChargeCap) {
      const clause = terms.per_charge_cap.clause;
      const exClauseId = terms.exception_clause?.clause.clause_id;
      const canRequestException = Boolean(
        exClauseId && ["5812", "5814"].includes(txn.merchant_category_code),
      );
      const exceptionHint = exClauseId ? ` Request an exception (${exClauseId}).` : "";
      return {
        transaction_id: txn.transaction_id,
        failure_reason: txn.failure_reason,
        headline: `Declined ${amount} at ${merchant}: exceeds the ${terms.currency} ${activePerChargeCap.toLocaleString("en-US")} single-charge cap (${clause.clause_id}).${exceptionHint}`,
        clause_id: clause.clause_id,
        clause_quote: clause.quote,
        ...(canRequestException ? { can_request_exception: true } : {}),
      };
    }
    const budgetClause = terms.budget.clause;
    return {
      transaction_id: txn.transaction_id,
      failure_reason: txn.failure_reason,
      headline: `Declined ${amount} at ${merchant}: exceeds the ${terms.currency} ${terms.budget.amount.toLocaleString("en-US")} approved trip budget (${budgetClause.clause_id}).`,
      clause_id: budgetClause.clause_id,
      clause_quote: budgetClause.quote,
    };
  }

  if (txn.failure_reason === "OUT_OF_ALLOWED_TIME_RANGE") {
    const expClause = terms.card_expires.clause;
    return {
      transaction_id: txn.transaction_id,
      failure_reason: txn.failure_reason,
      headline: `Declined ${amount} at ${merchant}: trip card expired 48 hours after scheduled return (${expClause.clause_id}).`,
      clause_id: expClause.clause_id,
      clause_quote: expClause.quote,
    };
  }

  const fallbackRule = rules.find((r) => r.declines.includes(txn.failure_reason!));
  const headline = (() => {
    switch (txn.failure_reason) {
      case "CURRENCY_NOT_ALLOWED":
        return `Declined ${amount} at ${merchant}: outside approved trip currency.`;
      case "CARD_INACTIVE":
        return `Declined ${amount}: the trip card is frozen.`;
      case "CARD_CLOSED":
        return `Declined ${amount}: the trip card is closed.`;
      case "INSUFFICIENT_FUNDS":
        return `Declined ${amount}: company wallet balance is insufficient.`;
      default:
        return `Declined ${amount}: ${txn.failure_reason}.`;
    }
  })();

  return {
    transaction_id: txn.transaction_id,
    failure_reason: txn.failure_reason,
    headline,
    ...(fallbackRule?.clause.clause_id !== undefined ? { clause_id: fallbackRule.clause.clause_id } : {}),
    ...(fallbackRule?.clause.quote !== undefined ? { clause_quote: fallbackRule.clause.quote } : {}),
  };
}
