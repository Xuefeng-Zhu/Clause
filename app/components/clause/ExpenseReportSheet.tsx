import {
  IconCheck,
  IconCircleX,
  IconDownload,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  formatContractDate,
  formatCurrency,
  getClauseTheme,
  humanizePolicyDeclineReason,
  resolvePolicyTransactionClauseId,
} from "./clause-format";
import type { ClauseJob, ClauseTransaction, JobSummary } from "./clause-types";

interface ExpenseReportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: ClauseJob;
  summary: JobSummary;
}

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

function isDeclinedTxn(t: ClauseTransaction): boolean {
  return Boolean(t.failure_reason || t.explanation);
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function categoryForTxn(t: ClauseTransaction, summary: JobSummary): string {
  return (
    summary.mccNames?.[t.merchant_category_code] ??
    FALLBACK_MCC_CATEGORY[t.merchant_category_code] ??
    `MCC ${t.merchant_category_code}`
  );
}

function clauseForTxn(t: ClauseTransaction, job: ClauseJob): string {
  if (job.policyTerms) {
    return (
      resolvePolicyTransactionClauseId(t, job.policyTerms) ??
      t.explanation?.clause_id ??
      "—"
    );
  }
  return t.explanation?.clause_id ?? "—";
}

export function buildExpenseReportCsv(
  job: ClauseJob,
  summary: JobSummary,
): string {
  const policyTerms = job.policyTerms;
  const currency = summary.currency || "USD";
  const approvedTxns = job.transactions.filter((t) => !isDeclinedTxn(t));
  const declinedTxns = job.transactions.filter((t) => isDeclinedTxn(t));
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
      categoryForTxn(t, summary),
      clauseForTxn(t, job),
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
      categoryForTxn(t, summary),
      clauseForTxn(t, job),
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
    "Owed to employee: $0.00 — nothing to reimburse",
  ]);

  return (
    "\uFEFF" +
    rows.map((r) => r.map((cell) => escapeCsvCell(cell)).join(",")).join("\n")
  );
}

export function ExpenseReportSheet({
  open,
  onOpenChange,
  job,
  summary,
}: ExpenseReportSheetProps) {
  const policyTerms = job.policyTerms;
  const currency = summary.currency || "USD";

  const approvedTxns = job.transactions.filter((t) => !isDeclinedTxn(t));
  const declinedTxns = job.transactions.filter((t) => isDeclinedTxn(t));
  const totalSpent = approvedTxns.reduce((sum, t) => sum + t.amount, 0);

  function handleExportCsv() {
    const csvText = buildExpenseReportCsv(job, summary);
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeRef = (summary.contractRef || "trip")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-");
    a.href = url;
    a.download = `expense-report-${safeRef}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported expense report CSV.");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col border-[#E5DFD2] bg-[#FAF8F3] p-0 text-stone-900 sm:max-w-lg"
      >
        <div className="border-b border-[#E6E0D4] px-6 py-5">
          <SheetTitle className="text-base font-semibold text-stone-900">
            Expense report — auto-generated
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-stone-600">
            {summary.contractor} · {summary.contractRef} · Approved by{" "}
            {summary.approver ?? policyTerms?.approver ?? "Manager"}
          </SheetDescription>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
          {/* Zero reimbursement hero card */}
          <div className="rounded-xl border border-[#0F7B55]/30 bg-white p-4 shadow-2xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
                Total company card spend
              </span>
              <span className="text-base font-semibold tabular-nums text-stone-900">
                {formatCurrency(totalSpent, currency)}{" "}
                <span className="text-xs font-normal text-stone-400">
                  / {formatCurrency(summary.total, currency)} budget
                </span>
              </span>
            </div>

            <div className="mt-3 rounded-lg bg-[#0F7B55]/10 px-3.5 py-2.5 text-sm font-semibold text-[#0F5C3F]">
              Owed to employee: $0.00 — nothing to reimburse
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
              Every approved charge was verified against Airwallex card controls
              at authorization time; out-of-policy charges were declined at the
              terminal before company funds moved.
            </p>
          </div>

          {/* Approved in-policy charges */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">
                Approved charges ({approvedTxns.length})
              </h3>
              <span className="font-semibold tabular-nums text-stone-800">
                {formatCurrency(totalSpent, currency)}
              </span>
            </div>

            {approvedTxns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#DFD8C8] bg-white/60 px-4 py-5 text-center text-xs text-stone-500">
                No settled or approved charges yet on this trip card.
              </div>
            ) : (
              <div className="divide-y divide-[#ECE6DA] rounded-xl border border-[#E6E0D4] bg-white">
                {approvedTxns.map((t) => {
                  const cid = clauseForTxn(t, job);
                  const theme = getClauseTheme(cid);
                  return (
                    <div
                      key={t.transaction_id}
                      className="space-y-1.5 px-4 py-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-stone-900">
                          {t.merchant_name}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-stone-900">
                          {formatCurrency(t.amount, t.currency)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
                        <span>
                          {formatContractDate(t.created_at)} ·{" "}
                          {categoryForTxn(t, summary)}
                        </span>
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                            theme.tagBg,
                            theme.tagText,
                            theme.tagBorder,
                          )}
                        >
                          {cid}
                        </span>
                      </div>

                      <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#0F7B55]">
                        <IconCheck className="size-3.5 shrink-0" />
                        <span>Receipt: matched by card controls</span>
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between bg-[#FAF8F3]/75 px-4 py-2.5 font-semibold text-stone-900">
                  <span>Total spent</span>
                  <span className="tabular-nums">
                    {formatCurrency(totalSpent, currency)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Declined out-of-policy attempts */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">
                Blocked out-of-policy attempts ({declinedTxns.length})
              </h3>
              <span className="text-[11px] text-stone-400">
                $0.00 charged
              </span>
            </div>

            {declinedTxns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#DFD8C8] bg-white/50 px-4 py-4 text-center text-xs text-stone-400">
                No declined terminal attempts.
              </div>
            ) : (
              <div className="divide-y divide-[#ECE6DA] rounded-xl border border-[#E6E0D4] bg-white/85">
                {declinedTxns.map((t) => {
                  const cid = clauseForTxn(t, job);
                  const theme = getClauseTheme(cid);
                  return (
                    <div
                      key={t.transaction_id}
                      className="space-y-1 px-4 py-2.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-medium text-stone-800">
                          <IconCircleX className="size-3.5 shrink-0 text-rose-600" />
                          <span>{t.merchant_name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-stone-400 line-through">
                          {formatCurrency(t.amount, t.currency)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 ps-5 text-[11px] text-stone-500">
                        <span>
                          {formatContractDate(t.created_at)} ·{" "}
                          {humanizePolicyDeclineReason(t)}
                        </span>
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                            theme.tagBg,
                            theme.tagText,
                            theme.tagBorder,
                          )}
                        >
                          {cid}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#E6E0D4] bg-white/85 px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs text-stone-600"
          >
            Close
          </Button>
          <Button
            id="exportReport"
            type="button"
            size="sm"
            onClick={handleExportCsv}
            className="bg-[#0F7B55] px-4 text-xs font-semibold text-white hover:bg-[#0C6646]"
          >
            <IconDownload className="size-3.5" />
            <span>Export CSV</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
