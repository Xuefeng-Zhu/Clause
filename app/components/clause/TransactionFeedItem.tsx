import { IconMessageChatbot } from "@tabler/icons-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  formatCurrency,
  formatRelativeTime,
  getClauseTheme,
  humanizeDeclineReason,
} from "./clause-format";
import type { ClauseTransaction } from "./clause-types";

interface TransactionFeedItemProps {
  txn: ClauseTransaction;
  clauseId?: string | undefined;
  mccLabel?: string | undefined;
  isHighlighted: boolean;
  isDimmed: boolean;
  onHoverClause: (clauseId: string | null) => void;
  onSelectClause: (clauseId: string) => void;
  onAskClause: (txnId: string, headline: string) => void;
}

export function TransactionFeedItem({
  txn,
  clauseId,
  mccLabel,
  isHighlighted,
  isDimmed,
  onHoverClause,
  onSelectClause,
  onAskClause,
}: TransactionFeedItemProps) {
  const isDeclined = Boolean(txn.failure_reason || txn.explanation);
  const humanReason = isDeclined
    ? txn.explanation?.prohibited
      ? `Prohibited spend${mccLabel ? ` (${mccLabel.toLowerCase()})` : ""}`
      : humanizeDeclineReason(txn.failure_reason ?? txn.explanation?.failure_reason)
    : "Building-supply merchant";

  const theme = getClauseTheme(clauseId);
  const displayClause = clauseId
    ? clauseId.toLowerCase().includes("change")
      ? "Change order"
      : clauseId
    : null;

  const tooltipText = [
    isDeclined
      ? (txn.failure_reason ?? txn.explanation?.failure_reason)
      : "CLEARING · APPROVED",
    `MCC ${txn.merchant_category_code}${mccLabel ? ` (${mccLabel})` : ""}`,
    formatRelativeTime(txn.created_at),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      onMouseEnter={() => {
        if (clauseId) onHoverClause(clauseId);
      }}
      onMouseLeave={() => onHoverClause(null)}
      className={cn(
        "group relative flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors duration-150",
        isHighlighted
          ? "bg-white/95 shadow-2xs ring-1 ring-stone-900/10"
          : "hover:bg-white/60",
        isDimmed && "opacity-55",
      )}
    >
      {/* Anchor dot for SVG connector line */}
      <span
        data-txn-anchor={txn.transaction_id}
        data-cites-clause={clauseId ?? ""}
        className={cn(
          "mt-1.5 size-2.5 shrink-0 rounded-full ring-2 ring-[#F6F3EC] transition-transform duration-150",
          isDeclined ? "bg-[#B45A52]" : "bg-[#0F7B55]",
          isHighlighted && "scale-125",
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-stone-900">
            {txn.merchant_name}
          </span>
          <span
            className={cn(
              "shrink-0 text-sm font-medium tabular-nums",
              isDeclined
                ? "text-stone-500 line-through decoration-stone-400/70"
                : "text-stone-900",
            )}
          >
            {formatCurrency(txn.amount, txn.currency)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "cursor-default font-medium",
                    isDeclined ? "text-[#9A3B34]" : "text-[#0F7B55]",
                  )}
                >
                  {isDeclined ? "Declined" : "Approved"}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-[11px]">
                {tooltipText}
              </TooltipContent>
            </Tooltip>

            <span aria-hidden="true" className="text-stone-300">
              —
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default text-stone-600">
                  {humanReason}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-[11px]">
                {tooltipText}
              </TooltipContent>
            </Tooltip>

            {displayClause && clauseId ? (
              <button
                type="button"
                onClick={() => onSelectClause(clauseId)}
                className={cn(
                  "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/45",
                  theme.tagBg,
                  theme.tagText,
                  theme.tagBorder,
                )}
              >
                {displayClause}
              </button>
            ) : null}
          </div>

          {isDeclined && txn.explanation ? (
            <button
              type="button"
              onClick={() =>
                onAskClause(txn.transaction_id, txn.explanation!.headline)
              }
              title="Ask Clause about this decline"
              aria-label="Ask Clause about this decline"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-stone-400 opacity-0 transition-opacity hover:bg-stone-200/60 hover:text-stone-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/40 group-hover:opacity-100"
            >
              <IconMessageChatbot className="size-3.5" />
              <span>Explain</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
