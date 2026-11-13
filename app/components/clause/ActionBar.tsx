import {
  IconArrowRight,
  IconCheck,
  IconFileCheck,
  IconFileDiff,
  IconLoader2,
  IconReceipt2,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type DeclaredProofKind,
  PROOF_KIND_OPTIONS,
  SAMPLE_CHANGE_ORDER_EMAIL_TEXT,
} from "@/lib/clause-samples";
import { cn } from "@/lib/utils";

import {
  cleanVerdictReasoning,
  formatContractDate,
  formatCurrency,
  formatMilestoneNumber,
  formatShortDate,
  formatSignedDelta,
  humanizeEvidenceKind,
} from "./clause-format";
import type {
  ClauseJob,
  JobSummary,
  UploadableProofFile,
} from "./clause-types";

interface ActionBarProps {
  job: ClauseJob;
  summary: JobSummary;
  busyLabel: string | null;
  onCancelBusy: () => void;

  // Draft approval
  onApproveTerms: () => void;

  // Proof sheet state & handlers
  proofSheetOpen: boolean;
  onProofSheetOpenChange: (open: boolean) => void;
  proofKind: DeclaredProofKind;
  onProofKindChange: (kind: DeclaredProofKind) => void;
  proofInputRef: RefObject<HTMLInputElement | null>;
  stagedProofFiles: UploadableProofFile[];
  onStageSelectedFiles: () => void;
  onRemoveStagedFile: (idx: number) => void;
  onSubmitProof: () => void;
  onApproveRelease: () => void;

  // Change order sheet state & handlers
  coSheetOpen: boolean;
  onCoSheetOpenChange: (open: boolean) => void;
  coEmailText: string;
  onCoEmailTextChange: (text: string) => void;
  onDraftChangeOrder: () => void;
  onApproveChangeOrder: () => void;

  // Shared reject
  onRejectPending: () => void;

  // Policy expense report
  onOpenExpenseReport?: () => void;
}

export function ActionBar({
  job,
  summary,
  busyLabel,
  onCancelBusy,
  onApproveTerms,
  proofSheetOpen,
  onProofSheetOpenChange,
  proofKind,
  onProofKindChange,
  proofInputRef,
  stagedProofFiles,
  onStageSelectedFiles,
  onRemoveStagedFile,
  onSubmitProof,
  onApproveRelease,
  coSheetOpen,
  onCoSheetOpenChange,
  coEmailText,
  onCoEmailTextChange,
  onDraftChangeOrder,
  onApproveChangeOrder,
  onRejectPending,
  onOpenExpenseReport,
}: ActionBarProps) {
  const isPolicy = job.kind === "policy" || summary.kind === "policy";
  const isDraft = summary.status === "draft";
  const isActive = summary.status === "active";
  const isClosed = summary.status === "closed";
  const isBusy = Boolean(busyLabel);

  const pending = job.pending ?? summary.pending ?? null;
  const pendingRelease =
    pending?.kind === "release_milestone" ? pending : null;
  const pendingCo = pending?.kind === "change_order" ? pending : null;
  const pendingException =
    pending?.kind === "policy_exception" ? pending : null;

  const hasValidationBlockers =
    job.problems.length > 0 ||
    (isPolicy && job.policyTerms
      ? job.policyTerms.open_questions.length > 0
      : job.terms.open_questions.length > 0);

  // Compute Change Order diff metrics when pendingCo is present
  const coDiff = (() => {
    if (!pendingCo?.change_order) return null;
    const co = pendingCo.change_order;
    const oldTotal = job.terms.total_amount;
    let newTotal = oldTotal;
    let newReleased = summary.released;
    for (const ch of co.milestone_amount_changes) {
      const existing = job.terms.milestones.find(
        (m) => m.id === ch.milestone_id,
      );
      if (existing) {
        const delta = ch.new_amount - existing.amount;
        newTotal += delta;
        if (job.releasedMilestoneIds.includes(existing.id)) {
          newReleased += delta;
        }
      }
    }
    const totalDelta = newTotal - oldTotal;
    const newDeadline = co.new_deadline ?? job.terms.deadline.date;
    return {
      oldTotal,
      newTotal,
      totalDelta,
      oldReleased: summary.released,
      newReleased,
      oldDeadline: job.terms.deadline.date,
      newDeadline,
      sourceQuote: co.source_quote,
      summaryText: co.summary,
      changes: co.milestone_amount_changes,
    };
  })();

  const approveReleaseLabel = pendingRelease
    ? `${formatMilestoneNumber(pendingRelease.milestone_id ?? "M2")} proof received — Approve release ${formatCurrency(pendingRelease.amount ?? 0, pendingRelease.currency)}`
    : "Approve release";

  const approveCoLabel = coDiff
    ? `Change order: ${formatSignedDelta(coDiff.totalDelta, summary.currency)}${
        coDiff.newDeadline !== coDiff.oldDeadline
          ? `, deadline ${formatShortDate(coDiff.newDeadline)}`
          : ""
      } — Approve`
    : "Approve change order";

  return (
    <>
      <div className="sticky bottom-0 z-20 mt-auto border-t border-[#E4DECFE6] bg-[#F6F3EC]/95 backdrop-blur-xs">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-2.5 px-4 py-3 sm:px-7">
          {/* Inline Change Order Diff Banner when pendingCo is staged and sheet is closed */}
          {pendingCo && coDiff && !coSheetOpen ? (
            <div className="rounded-xl border border-[#D4DFEA] bg-white/95 px-4 py-3 text-xs shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-semibold text-stone-900">
                    Proposed change order
                  </span>
                  <span className="tabular-nums text-stone-600">
                    Total:{" "}
                    <span className="text-stone-400 line-through">
                      {formatCurrency(coDiff.oldTotal, summary.currency)}
                    </span>{" "}
                    <IconArrowRight className="inline size-3 text-stone-400" />{" "}
                    <strong className="font-semibold text-stone-900">
                      {formatCurrency(coDiff.newTotal, summary.currency)}
                    </strong>
                  </span>
                  {coDiff.newReleased !== coDiff.oldReleased ? (
                    <span className="tabular-nums text-stone-600">
                      Released limit:{" "}
                      <span className="text-stone-400 line-through">
                        {formatCurrency(coDiff.oldReleased, summary.currency)}
                      </span>{" "}
                      <IconArrowRight className="inline size-3 text-stone-400" />{" "}
                      <strong className="font-semibold text-[#0F7B55]">
                        {formatCurrency(coDiff.newReleased, summary.currency)}
                      </strong>
                    </span>
                  ) : null}
                  {coDiff.newDeadline !== coDiff.oldDeadline ? (
                    <span className="tabular-nums text-stone-600">
                      Deadline:{" "}
                      <span className="text-stone-400 line-through">
                        {formatContractDate(coDiff.oldDeadline)}
                      </span>{" "}
                      <IconArrowRight className="inline size-3 text-stone-400" />{" "}
                      <strong className="font-semibold text-stone-900">
                        {formatContractDate(coDiff.newDeadline)}
                      </strong>
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onCoSheetOpenChange(true)}
                  className="text-xs font-medium text-[#0F7B55] hover:underline"
                >
                  View details
                </button>
              </div>
              <p className="font-contract-serif mt-1.5 text-[13px] italic text-stone-600">
                “{coDiff.sourceQuote}”
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left contextual status / busy slot */}
            <div className="flex min-w-0 items-center gap-3 text-xs text-stone-600">
              {busyLabel ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="inline-flex items-center gap-2 font-medium text-stone-800"
                >
                  <IconLoader2 className="size-3.5 animate-spin text-[#0F7B55]" />
                  <span>{busyLabel}</span>
                  <button
                    type="button"
                    onClick={onCancelBusy}
                    className="ms-1 rounded px-1.5 py-0.5 text-[11px] text-stone-500 hover:bg-stone-200/70 hover:text-stone-900"
                  >
                    Cancel
                  </button>
                </div>
              ) : isDraft ? (
                <span>
                  {isPolicy
                    ? "Review highlighted policy clauses and card controls before issuing the trip card."
                    : "Review highlighted clauses and card controls before issuing the contractor’s card."}
                </span>
              ) : isClosed ? (
                <span>
                  {isPolicy
                    ? "Trip closed · Virtual card permanently deactivated."
                    : "Contract closed · Virtual card permanently deactivated."}
                </span>
              ) : isPolicy ? (
                pendingException ? (
                  <span>
                    Exception requested (
                    <strong className="font-semibold text-stone-900">
                      {pendingException.exception?.clause.clause_id ?? "§3.4"}
                    </strong>
                    ) — review manager approval card in Live enforcement.
                  </span>
                ) : summary.activeException ? (
                  <span>
                    One-time exception active up to{" "}
                    <strong className="font-semibold tabular-nums text-[#0F7B55]">
                      {formatCurrency(
                        summary.activeException.one_time_cap,
                        summary.currency,
                      )}
                    </strong>{" "}
                    ({summary.activeException.clause.clause_id}) · Resets after
                    next approved charge.
                  </span>
                ) : (
                  <span>
                    In-policy swipes settle directly on the company card —{" "}
                    <strong className="font-medium text-stone-900">
                      $0.00 to reimburse
                    </strong>
                    .
                  </span>
                )
              ) : pendingRelease ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      pendingRelease.verdict?.verdict === "insufficient"
                        ? "bg-rose-500/15 text-rose-800"
                        : "bg-[#0F7B55]/12 text-[#0F7B55]",
                    )}
                  >
                    {pendingRelease.verdict?.verdict === "insufficient"
                      ? "Doesn't meet"
                      : "Meets requirements"}
                  </span>
                  <span className="truncate text-stone-600">
                    {cleanVerdictReasoning(pendingRelease.verdict?.reasoning)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onProofSheetOpenChange(true)}
                    className="font-medium text-stone-800 underline underline-offset-2 hover:text-[#0F7B55]"
                  >
                    View proof
                  </button>
                </div>
              ) : summary.nextMilestone ? (
                <span>
                  Next:{" "}
                  <strong className="font-medium text-stone-900">
                    {formatMilestoneNumber(summary.nextMilestone.id)} ·{" "}
                    {summary.nextMilestone.name}
                  </strong>{" "}
                  (
                  <span className="tabular-nums">
                    {formatCurrency(
                      summary.nextMilestone.amount,
                      summary.currency,
                    )}
                  </span>
                  )
                </span>
              ) : (
                <span>All contract milestones released.</span>
              )}
            </div>

            {/* Right primary & secondary actions */}
            <div className="ms-auto flex flex-wrap items-center gap-2">
              {isDraft ? (
                <Button
                  id="approveTerms"
                  type="button"
                  disabled={hasValidationBlockers || isBusy}
                  onClick={onApproveTerms}
                  className="h-9 rounded-lg bg-[#0F7B55] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#0C6646] focus-visible:ring-[#0F7B55]/45"
                >
                  {isPolicy
                    ? "Approve & issue trip card"
                    : "Approve & issue card"}
                </Button>
              ) : null}

              {isPolicy && !isDraft && onOpenExpenseReport ? (
                <Button
                  id="expenseReport"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenExpenseReport}
                  className="h-9 border-[#DCD5C6] bg-white/90 px-3.5 text-xs font-medium text-stone-800 hover:bg-white focus-visible:ring-[#0F7B55]/45"
                >
                  <IconReceipt2 className="size-3.5 text-[#0F7B55]" />
                  Expense report — auto-generated
                </Button>
              ) : null}

              {!isPolicy && isActive && pendingRelease ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBusy}
                    onClick={onRejectPending}
                    className="h-9 text-xs text-stone-600 hover:bg-stone-200/60 hover:text-stone-900"
                  >
                    Reject
                  </Button>
                  {!proofSheetOpen ? (
                    <Button
                      id="approveRelease"
                      type="button"
                      disabled={
                        pendingRelease.verdict?.verdict === "insufficient" ||
                        isBusy
                      }
                      onClick={onApproveRelease}
                      className="h-9 rounded-lg bg-[#0F7B55] px-4 text-xs font-semibold tabular-nums text-white shadow-xs hover:bg-[#0C6646] focus-visible:ring-[#0F7B55]/45"
                    >
                      {approveReleaseLabel}
                    </Button>
                  ) : null}
                </>
              ) : null}

              {!isPolicy && isActive && pendingCo ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBusy}
                    onClick={onRejectPending}
                    className="h-9 text-xs text-stone-600 hover:bg-stone-200/60 hover:text-stone-900"
                  >
                    Reject
                  </Button>
                  {!coSheetOpen ? (
                    <Button
                      id="approveCo"
                      type="button"
                      disabled={isBusy}
                      onClick={onApproveChangeOrder}
                      className="h-9 rounded-lg bg-[#0F7B55] px-4 text-xs font-semibold tabular-nums text-white shadow-xs hover:bg-[#0C6646] focus-visible:ring-[#0F7B55]/45"
                    >
                      {approveCoLabel}
                    </Button>
                  ) : null}
                </>
              ) : null}

              {!isPolicy && isActive && !pendingRelease && !pendingCo ? (
                <>
                  <Button
                    data-open-co="true"
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => onCoSheetOpenChange(true)}
                    className="h-9 border-[#DCD5C6] bg-white/85 text-xs font-medium text-stone-800 hover:bg-white focus-visible:ring-[#0F7B55]/45"
                  >
                    <IconFileDiff className="size-3.5 text-stone-500" />
                    Propose change order
                  </Button>

                  {summary.nextMilestone ? (
                    <Button
                      data-open-proof="true"
                      type="button"
                      disabled={isBusy}
                      onClick={() => onProofSheetOpenChange(true)}
                      className="h-9 rounded-lg bg-[#0F7B55] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#0C6646] focus-visible:ring-[#0F7B55]/45"
                    >
                      <IconFileCheck className="size-3.5" />
                      Submit proof for{" "}
                      {formatMilestoneNumber(summary.nextMilestone.id)}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Milestone Proof Submission Sheet */}
      <Sheet open={proofSheetOpen} onOpenChange={onProofSheetOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col border-[#E5DFD2] bg-[#FAF8F3] p-0 text-stone-900 sm:max-w-md"
        >
          <div className="border-b border-[#E6E0D4] px-6 py-5">
            <SheetTitle className="text-base font-semibold text-stone-900">
              {summary.nextMilestone
                ? `Submit proof for ${formatMilestoneNumber(summary.nextMilestone.id)}`
                : "Milestone proof"}
            </SheetTitle>
            <SheetDescription className="mt-1 text-xs text-stone-600">
              {summary.nextMilestone
                ? `${summary.nextMilestone.clauseId} · ${summary.nextMilestone.name} (${formatCurrency(summary.nextMilestone.amount, summary.currency)})`
                : "Review submitted milestone evidence and release approval."}
            </SheetDescription>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
            {summary.nextMilestone ? (
              <div className="rounded-lg border border-[#E6E0D4] bg-white p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
                  Required by {summary.nextMilestone.clauseId}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {summary.nextMilestone.evidenceRequired.length > 0 ? (
                    summary.nextMilestone.evidenceRequired.map((req) => (
                      <span
                        key={req}
                        className="inline-flex items-center rounded-md border border-[#DCE5DF] bg-[#F2F7F4] px-2 py-0.5 text-xs font-medium text-[#0F5C3F]"
                      >
                        {humanizeEvidenceKind(req)}
                      </span>
                    ))
                  ) : (
                    <span className="text-stone-500">
                      Owner sign-off only
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="proofKind"
                  className="text-xs font-medium text-stone-700"
                >
                  Document type
                </Label>
                <select
                  id="proofKind"
                  value={proofKind}
                  onChange={(e) =>
                    onProofKindChange(e.target.value as DeclaredProofKind)
                  }
                  className="h-9 w-full rounded-lg border border-[#DCD5C6] bg-white px-3 text-xs text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/45"
                >
                  {PROOF_KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="proofFiles"
                  className="text-xs font-medium text-stone-700"
                >
                  Attach photos or PDF
                </Label>
                <input
                  ref={proofInputRef}
                  id="proofFiles"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,application/pdf"
                  className="block h-9 w-full rounded-lg border border-[#DCD5C6] bg-white px-2.5 py-1.5 text-xs text-stone-800 file:me-2.5 file:rounded file:border-0 file:bg-[#F2EFE8] file:px-2.5 file:py-0.5 file:text-xs file:font-medium file:text-stone-800"
                />
              </div>

              {stagedProofFiles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {stagedProofFiles.map((f, idx) => (
                    <span
                      key={`${f.filename}-${idx}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#E5DFD2] bg-white px-2 py-1 text-[11px] text-stone-700"
                    >
                      <span className="font-medium">
                        {humanizeEvidenceKind(f.declaredKind)}:
                      </span>
                      <span className="truncate max-w-[160px]">
                        {f.filename}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${f.filename}`}
                        onClick={() => onRemoveStagedFile(idx)}
                        className="text-stone-400 hover:text-stone-800"
                      >
                        <IconX className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  id="submitProof"
                  type="button"
                  size="sm"
                  disabled={!isActive || !summary.nextMilestone || isBusy}
                  onClick={onSubmitProof}
                  className="bg-stone-900 text-xs font-medium text-white hover:bg-stone-800"
                >
                  <IconUpload className="size-3.5" />
                  Evaluate proof
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!isActive || isBusy}
                  onClick={onStageSelectedFiles}
                  className="text-xs text-stone-600"
                >
                  Add another file
                </Button>
              </div>
            </div>

            {/* Verdict Card */}
            {pendingRelease?.verdict ? (
              <div
                className={cn(
                  "rounded-xl border p-4",
                  pendingRelease.verdict.verdict === "insufficient"
                    ? "border-rose-500/35 bg-rose-50/75"
                    : "border-[#0F7B55]/30 bg-[#0F7B55]/[0.06]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-semibold",
                      pendingRelease.verdict.verdict === "insufficient"
                        ? "text-rose-800"
                        : "text-[#0F7B55]",
                    )}
                  >
                    {pendingRelease.verdict.verdict === "insufficient" ? (
                      <>
                        <IconX className="size-4" />
                        Doesn’t meet requirements
                      </>
                    ) : (
                      <>
                        <IconCheck className="size-4" />
                        Meets requirements
                      </>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums text-stone-900">
                    +{formatCurrency(pendingRelease.amount ?? 0, pendingRelease.currency)}
                  </span>
                </div>

                <p className="mt-2 leading-relaxed text-stone-700">
                  {cleanVerdictReasoning(pendingRelease.verdict.reasoning)}
                </p>

                {pendingRelease.verdict.observed.length > 0 ? (
                  <ul className="mt-2.5 space-y-1 text-[11px] text-stone-600">
                    {pendingRelease.verdict.observed.map((obs, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <IconCheck className="size-3 shrink-0 text-[#0F7B55]" />
                        <span>{obs}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {pendingRelease.verdict.missing.length > 0 ? (
                  <ul className="mt-2.5 space-y-1 text-[11px] text-rose-800">
                    {pendingRelease.verdict.missing.map((miss, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <IconX className="size-3 shrink-0 text-rose-600" />
                        <span>Missing: {humanizeEvidenceKind(miss)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {pendingRelease.evidence_sha256 ? (
                  <div className="mt-3 border-t border-stone-900/10 pt-2 font-mono text-[10px] text-stone-500">
                    Evidence hash: sha256:{pendingRelease.evidence_sha256.slice(0, 16)}…
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[#E6E0D4] bg-white/80 px-6 py-4">
            {pendingRelease ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  onClick={onRejectPending}
                  className="text-xs text-stone-600"
                >
                  Reject
                </Button>
                <Button
                  id="approveRelease"
                  type="button"
                  disabled={
                    pendingRelease.verdict?.verdict === "insufficient" || isBusy
                  }
                  onClick={() => {
                    onApproveRelease();
                    onProofSheetOpenChange(false);
                  }}
                  className="bg-[#0F7B55] text-xs font-semibold tabular-nums text-white hover:bg-[#0C6646]"
                >
                  {approveReleaseLabel}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onProofSheetOpenChange(false)}
                className="ms-auto border-[#DCD5C6] bg-white text-xs"
              >
                Close
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Propose Change Order Sheet */}
      <Sheet open={coSheetOpen} onOpenChange={onCoSheetOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col border-[#E5DFD2] bg-[#FAF8F3] p-0 text-stone-900 sm:max-w-lg"
        >
          <div className="border-b border-[#E6E0D4] px-6 py-5">
            <SheetTitle className="text-base font-semibold text-stone-900">
              Propose change order
            </SheetTitle>
            <SheetDescription className="mt-1 text-xs text-stone-600">
              Extract scope, milestone amount, and schedule changes from a
              contractor message before updating card controls.
            </SheetDescription>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="coEmailTextarea"
                  className="text-xs font-medium text-stone-700"
                >
                  Contractor message or email
                </Label>
                {coEmailText !== SAMPLE_CHANGE_ORDER_EMAIL_TEXT ? (
                  <button
                    type="button"
                    onClick={() =>
                      onCoEmailTextChange(SAMPLE_CHANGE_ORDER_EMAIL_TEXT)
                    }
                    className="text-[11px] font-medium text-[#0F7B55] hover:underline"
                  >
                    Use sample email
                  </button>
                ) : null}
              </div>
              <textarea
                id="coEmailTextarea"
                rows={6}
                value={coEmailText}
                onChange={(e) => onCoEmailTextChange(e.target.value)}
                placeholder="Paste contractor email requesting a scope, price, or deadline change…"
                className="w-full rounded-lg border border-[#DCD5C6] bg-white p-3 text-xs leading-relaxed text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/45"
              />
              <div className="flex justify-end">
                <Button
                  id="draftCo"
                  type="button"
                  size="sm"
                  disabled={!isActive || isBusy}
                  onClick={onDraftChangeOrder}
                  className="bg-stone-900 text-xs font-medium text-white hover:bg-stone-800"
                >
                  Propose change order
                </Button>
              </div>
            </div>

            {/* Structured Before -> After Diff */}
            {coDiff ? (
              <div className="space-y-3 rounded-xl border border-[#CEDCE9] bg-white p-4">
                <div className="text-xs font-semibold text-stone-900">
                  Contract &amp; card impact
                </div>
                <p className="text-stone-600">{coDiff.summaryText}</p>

                <div className="divide-y divide-stone-100 rounded-lg border border-stone-200/80 bg-[#FAF8F3] px-3 py-1">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-stone-500">Contract total</span>
                    <span className="font-medium tabular-nums text-stone-900">
                      <span className="text-stone-400 line-through">
                        {formatCurrency(coDiff.oldTotal, summary.currency)}
                      </span>{" "}
                      → {formatCurrency(coDiff.newTotal, summary.currency)} (
                      <span className="text-[#0F7B55]">
                        {formatSignedDelta(
                          coDiff.totalDelta,
                          summary.currency,
                        )}
                      </span>
                      )
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-stone-500">Released card limit</span>
                    <span className="font-medium tabular-nums text-stone-900">
                      {coDiff.newReleased !== coDiff.oldReleased ? (
                        <>
                          <span className="text-stone-400 line-through">
                            {formatCurrency(
                              coDiff.oldReleased,
                              summary.currency,
                            )}
                          </span>{" "}
                          →{" "}
                          <span className="text-[#0F7B55]">
                            {formatCurrency(
                              coDiff.newReleased,
                              summary.currency,
                            )}
                          </span>
                        </>
                      ) : (
                        <span>
                          {formatCurrency(coDiff.oldReleased, summary.currency)}{" "}
                          (unchanged until release)
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-stone-500">Completion deadline</span>
                    <span className="font-medium tabular-nums text-stone-900">
                      {coDiff.newDeadline !== coDiff.oldDeadline ? (
                        <>
                          <span className="text-stone-400 line-through">
                            {formatContractDate(coDiff.oldDeadline)}
                          </span>{" "}
                          → {formatContractDate(coDiff.newDeadline)}
                        </>
                      ) : (
                        formatContractDate(coDiff.oldDeadline)
                      )}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border-s-2 border-[#4676A8] bg-[#F2F6FA] px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#1E4B7A]">
                    Source sentence
                  </div>
                  <p className="font-contract-serif mt-1 text-[13px] italic text-stone-700">
                    “{coDiff.sourceQuote}”
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[#E6E0D4] bg-white/80 px-6 py-4">
            {pendingCo ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  onClick={onRejectPending}
                  className="text-xs text-stone-600"
                >
                  Reject
                </Button>
                <Button
                  id="approveCo"
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    onApproveChangeOrder();
                    onCoSheetOpenChange(false);
                  }}
                  className="bg-[#0F7B55] text-xs font-semibold tabular-nums text-white hover:bg-[#0C6646]"
                >
                  {approveCoLabel}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onCoSheetOpenChange(false)}
                className="ms-auto border-[#DCD5C6] bg-white text-xs"
              >
                Close
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
