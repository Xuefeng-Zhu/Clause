import { IconCheck, IconClock, IconLock } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

import { formatContractDate, formatCurrency } from "./clause-format";
import type { ClauseJob, JobSummary } from "./clause-types";

interface MilestoneBarProps {
  job: ClauseJob;
  summary: JobSummary;
  activeClauseId: string | null;
  onHoverClause: (clauseId: string | null) => void;
  onSelectClause: (clauseId: string) => void;
}

export function MilestoneBar({
  job,
  summary,
  activeClauseId,
  onHoverClause,
  onSelectClause,
}: MilestoneBarProps) {
  const { terms, releasedMilestoneIds } = job;
  const isDraft = summary.status === "draft";
  const pendingReleaseId =
    job.pending?.kind === "release_milestone"
      ? job.pending.milestone_id
      : undefined;

  return (
    <div className="space-y-2.5">
      {/* Totals summary line */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-600">
        <span>
          Contract{" "}
          <strong className="font-semibold tabular-nums text-stone-900">
            {formatCurrency(summary.total, summary.currency)}
          </strong>
        </span>
        <span aria-hidden="true" className="text-stone-300">
          ·
        </span>
        <span>
          Released{" "}
          <strong className="font-semibold tabular-nums text-[#0F7B55]">
            {formatCurrency(summary.released, summary.currency)}
          </strong>
        </span>
        <span aria-hidden="true" className="text-stone-300">
          ·
        </span>
        <span>
          Spent{" "}
          <strong className="font-semibold tabular-nums text-stone-900">
            {formatCurrency(summary.spent, summary.currency)}
          </strong>
        </span>
        <span aria-hidden="true" className="text-stone-300">
          ·
        </span>
        <span>
          Available{" "}
          <strong className="font-semibold tabular-nums text-stone-900">
            {formatCurrency(summary.available, summary.currency)}
          </strong>
        </span>
        <span aria-hidden="true" className="text-stone-300">
          ·
        </span>
        <span>
          Deadline{" "}
          <strong className="font-semibold tabular-nums text-stone-900">
            {formatContractDate(summary.deadline)}
          </strong>
        </span>
      </div>

      {/* Slim 3-segment milestone track */}
      <div
        role="list"
        aria-label="Contract milestones"
        className="grid grid-cols-1 gap-1.5 sm:grid-cols-3"
      >
        {terms.milestones.map((m) => {
          const isReleased = releasedMilestoneIds.includes(m.id);
          const isAwaiting =
            !isReleased &&
            !isDraft &&
            (summary.nextMilestone?.id === m.id || pendingReleaseId === m.id);
          const isSigningDraft = isDraft && m.released_on_signing;
          const isActive = activeClauseId === m.clause.clause_id;

          const statusLabel = isReleased
            ? "Released"
            : pendingReleaseId === m.id
              ? "Proof received"
              : isAwaiting
                ? "Awaiting proof"
                : isSigningDraft
                  ? "On signing"
                  : "Locked";

          return (
            <button
              key={m.id}
              type="button"
              role="listitem"
              onMouseEnter={() => onHoverClause(m.clause.clause_id)}
              onMouseLeave={() => onHoverClause(null)}
              onClick={() => onSelectClause(m.clause.clause_id)}
              className={cn(
                "group flex flex-col justify-between gap-1 rounded-lg border px-3 py-2 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/45",
                isReleased
                  ? "border-[#0F7B55]/25 bg-[#0F7B55]/[0.06]"
                  : isAwaiting || isSigningDraft
                    ? "border-amber-600/25 bg-white/85"
                    : "border-[#E5DFD2] bg-white/55",
                isActive && "ring-1 ring-stone-900/20 bg-white",
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate text-[11px] font-medium text-stone-600">
                  {m.id} · {m.name}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-xs text-stone-900">
                  {formatCurrency(m.amount, terms.currency)}
                </span>
              </div>
              <div className="flex w-full items-center justify-between gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-medium",
                    isReleased
                      ? "text-[#0F7B55]"
                      : isAwaiting || isSigningDraft
                        ? "text-amber-800"
                        : "text-stone-500",
                  )}
                >
                  {isReleased ? (
                    <IconCheck className="size-3 shrink-0" strokeWidth={2.4} />
                  ) : isAwaiting || isSigningDraft ? (
                    <IconClock className="size-3 shrink-0" strokeWidth={2} />
                  ) : (
                    <IconLock className="size-3 shrink-0" strokeWidth={2} />
                  )}
                  {statusLabel}
                </span>
                <span className="font-sans text-[10px] font-medium text-stone-400 group-hover:text-stone-600">
                  {m.clause.clause_id}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
