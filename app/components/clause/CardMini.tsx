import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  formatCardLast4,
  formatContractDate,
  formatCurrency,
} from "./clause-format";
import type { JobSummary } from "./clause-types";

interface CardMiniProps {
  summary: JobSummary;
  isFrozen: boolean;
  busy: boolean;
  onToggleFreeze: () => void;
}

export function CardMini({
  summary,
  isFrozen,
  busy,
  onToggleFreeze,
}: CardMiniProps) {
  const isClosed = summary.status === "closed";
  const isActive = summary.status === "active" && !isFrozen;
  const last4 = formatCardLast4(summary.cardId);

  const statusText = isClosed ? "Closed" : isFrozen ? "Frozen" : "Active";

  return (
    <div className="clause-card-surface rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default font-sans text-sm font-medium tracking-wider tabular-nums text-stone-900">
              •••• {last4}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="font-mono text-xs">
            {summary.cardId ?? "Virtual card"}
          </TooltipContent>
        </Tooltip>

        {/* Payment network emblem matching concept-b */}
        <span
          aria-hidden="true"
          className="inline-flex items-center select-none"
        >
          <span className="size-4 rounded-full bg-[#EB001B]/90" />
          <span className="-ms-1.5 size-4 rounded-full bg-[#F79E1B]/90 mix-blend-multiply" />
        </span>
      </div>

      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium tabular-nums text-stone-700">
          {formatCurrency(summary.released, summary.currency)} limit
        </div>
        <div className="text-xs tabular-nums text-stone-400">
          Exp {formatContractDate(summary.deadline)}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#EFEAE0] pt-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 rounded-full",
              isActive
                ? "bg-[#0F7B55]"
                : isFrozen
                  ? "bg-amber-600"
                  : "bg-stone-400",
            )}
          />
          <span
            className={cn(
              "text-xs font-medium",
              isActive
                ? "text-[#0F7B55]"
                : isFrozen
                  ? "text-amber-700"
                  : "text-stone-500",
            )}
          >
            {statusText}
          </span>
          <span className="text-[11px] tabular-nums text-stone-400">
            · {formatCurrency(summary.available, summary.currency)} available
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            aria-label={isFrozen ? "Activate card" : "Freeze card"}
            checked={isActive}
            disabled={isClosed || busy}
            onCheckedChange={() => onToggleFreeze()}
          />
        </div>
      </div>
    </div>
  );
}
