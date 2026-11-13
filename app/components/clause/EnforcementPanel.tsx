import { IconAlertTriangle, IconShieldCheck } from "@tabler/icons-react";
import { useMemo } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { CardMini } from "./CardMini";
import { TransactionFeedItem } from "./TransactionFeedItem";
import {
  derivePlainControls,
  formatContractDate,
  formatCurrency,
  getClauseTheme,
  humanizeEvidenceKind,
  resolveTransactionClauseId,
} from "./clause-format";
import type { ClauseJob, JobSummary } from "./clause-types";

interface EnforcementPanelProps {
  job: ClauseJob;
  summary: JobSummary;
  isFrozen: boolean;
  busy: boolean;
  activeClauseId: string | null;
  onHoverClause: (clauseId: string | null) => void;
  onSelectClause: (clauseId: string) => void;
  onToggleFreeze: () => void;
  onAskClause: (txnId: string, headline: string) => void;
}

export function EnforcementPanel({
  job,
  summary,
  isFrozen,
  busy,
  activeClauseId,
  onHoverClause,
  onSelectClause,
  onToggleFreeze,
  onAskClause,
}: EnforcementPanelProps) {
  const isDraft = summary.status === "draft";
  const controls = useMemo(
    () =>
      derivePlainControls(job.terms, job.rules, job.releasedMilestoneIds),
    [job.terms, job.rules, job.releasedMilestoneIds],
  );

  const reversedTxns = useMemo(
    () => [...job.transactions].reverse(),
    [job.transactions],
  );

  const validationIssues = useMemo(
    () => [...job.problems, ...job.terms.open_questions],
    [job.problems, job.terms.open_questions],
  );

  if (isDraft) {
    const signingTotal = job.terms.milestones
      .filter((m) => m.released_on_signing)
      .reduce((s, m) => s + m.amount, 0);

    return (
      <aside aria-label="Derived card controls" className="space-y-5">
        <div>
          <h2 className="font-contract-serif text-lg font-normal tracking-tight text-stone-900">
            Card controls to issue
          </h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Derived deterministically from the highlighted clauses on the left.
          </p>
        </div>

        {validationIssues.length > 0 ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/40 bg-amber-50/90 p-3.5 text-xs text-amber-950"
          >
            <div className="flex items-center gap-2 font-semibold">
              <IconAlertTriangle className="size-4 shrink-0 text-amber-700" />
              <span>Resolve before issuing card</span>
            </div>
            <ul className="mt-1.5 list-disc space-y-1 ps-5 text-amber-900/90">
              {validationIssues.map((issue, idx) => (
                <li key={idx}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Opening virtual card preview */}
        <div className="clause-card-surface rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F7B55]">
              <IconShieldCheck className="size-4" />
              Ready to issue virtual card
            </span>
            <span
              aria-label="Visa"
              className="select-none font-sans text-[13px] font-extrabold italic leading-none tracking-tight text-[#1A1F71]"
            >
              VISA
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold tabular-nums text-stone-900">
              {formatCurrency(signingTotal, summary.currency)} limit
            </span>
            <span className="text-xs tabular-nums text-stone-500">
              Cutoff {formatContractDate(summary.deadline)}
            </span>
          </div>
          <div className="mt-1 text-xs text-stone-500">
            Remaining{" "}
            <span className="font-medium tabular-nums text-stone-700">
              {formatCurrency(summary.total - signingTotal, summary.currency)}
            </span>{" "}
            stays locked until milestone proof is approved.
          </div>
        </div>

        {/* Derived controls list */}
        <div className="space-y-1.5">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
            Enforced rules ({controls.length})
          </h3>
          <div className="divide-y divide-[#EAE4D7] rounded-xl border border-[#E6E0D4] bg-white/80">
            {controls.map((ctrl) => {
              const theme = getClauseTheme(ctrl.clauseId);
              const isHighlighted = activeClauseId === ctrl.clauseId;
              const isDimmed = Boolean(
                activeClauseId && activeClauseId !== ctrl.clauseId,
              );
              return (
                <div
                  key={ctrl.id}
                  onMouseEnter={() => onHoverClause(ctrl.clauseId)}
                  onMouseLeave={() => onHoverClause(null)}
                  onClick={() => onSelectClause(ctrl.clauseId)}
                  className={cn(
                    "flex cursor-pointer items-start justify-between gap-3 px-3.5 py-2.5 transition-colors",
                    isHighlighted ? "bg-[#FAF6EE]" : "hover:bg-stone-50/80",
                    isDimmed && "opacity-55",
                  )}
                >
                  <div className="min-w-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-xs font-medium text-stone-900">
                          {ctrl.label}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="left"
                        className="max-w-xs font-mono text-[11px]"
                      >
                        {ctrl.technicalTooltip}
                      </TooltipContent>
                    </Tooltip>
                    <div className="mt-0.5 text-[11px] text-stone-500">
                      {ctrl.detail}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none",
                      theme.tagBg,
                      theme.tagText,
                      theme.tagBorder,
                    )}
                  >
                    {ctrl.clauseId}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Release schedule summary */}
        <div className="space-y-1.5">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
            Release schedule
          </h3>
          <div className="divide-y divide-[#EAE4D7] rounded-xl border border-[#E6E0D4] bg-white/70">
            {job.terms.milestones.map((m) => (
              <div
                key={m.id}
                onMouseEnter={() => onHoverClause(m.clause.clause_id)}
                onMouseLeave={() => onHoverClause(null)}
                onClick={() => onSelectClause(m.clause.clause_id)}
                className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-xs hover:bg-stone-50/80"
              >
                <div className="min-w-0">
                  <span className="font-medium text-stone-800">
                    {m.id} · {m.name}
                  </span>
                  <div className="text-[11px] text-stone-500">
                    {m.released_on_signing
                      ? "Released on card issuance"
                      : `Requires ${m.evidence_required.map(humanizeEvidenceKind).join(" + ")}`}
                  </div>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-stone-900">
                  {formatCurrency(m.amount, summary.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label="Live enforcement" className="space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-contract-serif text-lg font-normal tracking-tight text-stone-900">
          Live enforcement
        </h2>
      </div>

      <CardMini
        summary={summary}
        isFrozen={isFrozen}
        busy={busy}
        onToggleFreeze={onToggleFreeze}
      />

      {/* Plain-English Card Controls */}
      <div className="space-y-1.5">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
          Active controls
        </h3>
        <div className="divide-y divide-[#EAE4D7] rounded-xl border border-[#E6E0D4] bg-white/75">
          {controls.map((ctrl) => {
            const theme = getClauseTheme(ctrl.clauseId);
            const isHighlighted = activeClauseId === ctrl.clauseId;
            const isDimmed = Boolean(
              activeClauseId && activeClauseId !== ctrl.clauseId,
            );
            const displayClause = ctrl.clauseId
              .toLowerCase()
              .includes("change")
              ? "Change order"
              : ctrl.clauseId;

            return (
              <div
                key={ctrl.id}
                onMouseEnter={() => onHoverClause(ctrl.clauseId)}
                onMouseLeave={() => onHoverClause(null)}
                onClick={() => onSelectClause(ctrl.clauseId)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2 transition-colors duration-150",
                  isHighlighted
                    ? "bg-white ring-1 ring-inset ring-stone-900/10"
                    : "hover:bg-white/90",
                  isDimmed && "opacity-55",
                )}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-stone-800">
                        {ctrl.label}
                      </div>
                      <div className="truncate text-[11px] text-stone-500">
                        {ctrl.detail}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="left"
                    className="max-w-xs font-mono text-[11px]"
                  >
                    {ctrl.technicalTooltip}
                  </TooltipContent>
                </Tooltip>

                <span
                  className={cn(
                    "shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none",
                    theme.tagBg,
                    theme.tagText,
                    theme.tagBorder,
                  )}
                >
                  {displayClause}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transactions Feed */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
            Transactions
          </h3>
          {reversedTxns.length > 0 ? (
            <span className="text-[11px] tabular-nums text-stone-400">
              {reversedTxns.length}
            </span>
          ) : null}
        </div>

        {reversedTxns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#DFD8C8] bg-white/45 px-4 py-6 text-center text-xs text-stone-500">
            Card authorizations appear here in real time, linked to the contract
            clause that governs each decision.
          </div>
        ) : (
          <div className="relative space-y-1">
            {reversedTxns.length > 1 ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-5 left-[14px] top-5 w-px bg-[#DED8CA]"
              />
            ) : null}
            {reversedTxns.map((txn) => {
              const cid = resolveTransactionClauseId(txn, job.terms);
              const isHighlighted = Boolean(
                activeClauseId && cid && activeClauseId === cid,
              );
              const isDimmed = Boolean(
                activeClauseId && (!cid || activeClauseId !== cid),
              );
              return (
                <TransactionFeedItem
                  key={txn.transaction_id}
                  txn={txn}
                  clauseId={cid}
                  mccLabel={summary.mccNames?.[txn.merchant_category_code]}
                  isHighlighted={isHighlighted}
                  isDimmed={isDimmed}
                  onHoverClause={onHoverClause}
                  onSelectClause={onSelectClause}
                  onAskClause={onAskClause}
                />
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
