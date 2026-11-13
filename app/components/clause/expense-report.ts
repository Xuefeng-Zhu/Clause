import {
  humanizePolicyDeclineReason,
  resolvePolicyTransactionClauseId,
} from "./clause-format";
import type { ClauseJob, ClauseTransaction, JobSummary } from "./clause-types";

export const ZERO_REIMBURSEMENT_LINE =
  "Owed to employee: $0.00 — nothing to reimburse";

const FALLBACK_MCC_CATEGORY: Record<string, string> = {
  "7011": "Hotels & lodging",
  "4511": "Airlines & airfare",
  "3058": "Airlines & airfare",
  "4121": "Rideshare & taxicabs",
  "4111": "Commuter transit",
  "4131": "Bus lines",
  "5812": "Restaurants & business meals",
  "5814": "Quick-service meals",
  "5813": "Bars & nightclubs",
  "5732": "Electronics stores",
  "5734": "Computer software stores",
  "5999": "Specialty retail & gift cards",
};

export function isDeclinedPolicyTxn(t: ClauseTransaction): boolean {
  return Boolean(t.failure_reason || t.explanation);
}

export function categoryForExpenseTxn(
  t: ClauseTransaction,
  summary: JobSummary,
): string {
  return (
    summary.mccNames?.[t.merchant_category_code] ??
    FALLBACK_MCC_CATEGORY[t.merchant_category_code] ??
    `MCC ${t.merchant_category_code}`
  );
}

export function clauseForExpenseTxn(
  t: ClauseTransaction,
  job: ClauseJob,
): string {
  if (job.policyTerms) {
    return (
      resolvePolicyTransactionClauseId(t, job.policyTerms) ??
      t.explanation?.clause_id ??
      "—"
    );
  }
  return t.explanation?.clause_id ?? "—";
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildExpenseReportCsv(
  job: ClauseJob,
  summary: JobSummary,
): string {
  const policyTerms = job.policyTerms;
  const currency = summary.currency || "USD";
  const approvedTxns = job.transactions.filter((t) => !isDeclinedPolicyTxn(t));
  const declinedTxns = job.transactions.filter((t) => isDeclinedPolicyTxn(t));
  const totalSpent = approvedTxns.reduce((sum, t) => sum + t.amount, 0);

  const header = [
    "Status",
    "Date",
    "Merchant",
    "MCC",
    "Category",
    "Policy Clause",
    "Amount",
    "Currency",
    "Receipt / Control Note",
  ];
  const rows: string[][] = [header];

  for (const t of approvedTxns) {
    rows.push([
      "APPROVED",
      t.created_at.slice(0, 10),
      t.merchant_name,
      t.merchant_category_code,
      categoryForExpenseTxn(t, summary),
      clauseForExpenseTxn(t, job),
      t.amount.toFixed(2),
      t.currency,
      "Receipt: matched by card controls",
    ]);
  }

  for (const t of declinedTxns) {
    rows.push([
      "DECLINED (blocked at terminal)",
      t.created_at.slice(0, 10),
      t.merchant_name,
      t.merchant_category_code,
      categoryForExpenseTxn(t, summary),
      clauseForExpenseTxn(t, job),
      t.amount.toFixed(2),
      t.currency,
      humanizePolicyDeclineReason(t),
    ]);
  }

  rows.push([]);
  rows.push([
    "SUMMARY",
    "",
    "Total approved spend",
    "",
    "",
    policyTerms?.budget.clause.clause_id ?? "§2.2",
    totalSpent.toFixed(2),
    currency,
    `Approved trip budget ${summary.total.toFixed(2)} ${currency}`,
  ]);
  rows.push([
    "REIMBURSEMENT",
    "",
    "Owed to employee",
    "",
    "",
    "",
    "0.00",
    currency,
    ZERO_REIMBURSEMENT_LINE,
  ]);

  return (
    "\uFEFF" +
    rows.map((r) => r.map((cell) => escapeCsvCell(cell)).join(",")).join("\n")
  );
}
