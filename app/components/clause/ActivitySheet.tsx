import {
  IconCheck,
  IconCreditCard,
  IconFileDiff,
  IconFileText,
  IconLock,
  IconPhoto,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";
import { useMemo } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  cleanVerdictReasoning,
  formatCurrency,
  formatRelativeTime,
} from "./clause-format";
import type { JobEvent } from "./clause-types";

function formatAuditDetail(detail: string): string {
  const cleaned = cleanVerdictReasoning(detail)
    .replace(
      /agent says "meets"\.\s*/i,
      "verified — meets contract requirements. ",
    )
    .replace(
      /agent says "insufficient"\.\s*/i,
      "flagged — missing required documentation. ",
    )
    .replace(/\bUSD\s+(\d+(?:\.\d+)?)/g, (_m, num) =>
      formatCurrency(Number(num), "USD"),
    );
  return cleaned;
}

function eventActorAndIcon(type: JobEvent["type"]) {
  switch (type) {
    case "terms_parsed":
      return {
        actor: "Clause parser",
        Icon: IconFileText,
        tone: "bg-stone-200/80 text-stone-700",
      };
    case "terms_approved":
    case "release_approved":
    case "change_order_approved":
    case "exception_approved":
      return {
        actor: "Owner approval",
        Icon: IconShieldCheck,
        tone: "bg-[#0F7B55]/15 text-[#0F7B55]",
      };
    case "card_issued":
      return {
        actor: "Airwallex Issuing",
        Icon: IconCreditCard,
        tone: "bg-[#0F7B55]/15 text-[#0F7B55]",
      };
    case "charge_approved":
      return {
        actor: "Card authorization",
        Icon: IconCheck,
        tone: "bg-[#0F7B55]/15 text-[#0F7B55]",
      };
    case "charge_declined":
    case "release_rejected":
      return {
        actor: "Clause enforcement",
        Icon: IconX,
        tone: "bg-rose-500/15 text-rose-700",
      };
    case "proof_submitted":
      return {
        actor: "Evidence review",
        Icon: IconPhoto,
        tone: "bg-amber-500/15 text-amber-800",
      };
    case "change_order_drafted":
    case "exception_requested":
      return {
        actor: type === "exception_requested" ? "Exception request" : "Change order",
        Icon: IconFileDiff,
        tone: "bg-[#4676A8]/15 text-[#1E4B7A]",
      };
    case "exception_used":
    case "card_frozen":
    case "card_closed":
      return {
        actor: "Card control",
        Icon: IconLock,
        tone: "bg-stone-200/90 text-stone-700",
      };
  }
}

interface ActivitySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: JobEvent[];
  contractRef?: string | undefined;
}

export function ActivitySheet({
  open,
  onOpenChange,
  events,
  contractRef,
}: ActivitySheetProps) {
  const reversed = useMemo(() => [...events].reverse(), [events]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col border-[#E5DFD2] bg-[#FAF8F3] p-0 text-stone-900 sm:max-w-md"
      >
        <div className="border-b border-[#E6E0D4] px-6 py-5">
          <SheetTitle className="text-base font-semibold text-stone-900">
            Activity
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-stone-600">
            {contractRef
              ? `Immutable audit trail of approvals, derived card rules, and authorizations for ${contractRef}.`
              : "Audit trail of contract approvals and card activity."}
          </SheetDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {reversed.length === 0 ? (
            <p className="py-8 text-center text-xs text-stone-500">
              No activity recorded yet.
            </p>
          ) : (
            <ol className="relative space-y-4">
              {reversed.length > 1 ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-4 left-[15px] top-4 w-px bg-[#E2DCCE]"
                />
              ) : null}
              {reversed.map((ev, idx) => {
                const { actor, Icon, tone } = eventActorAndIcon(ev.type);
                return (
                  <li
                    key={`${ev.at}-${idx}`}
                    className="relative flex items-start gap-3"
                  >
                    <span
                      className={cn(
                        "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-[#FAF8F3]",
                        tone,
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-stone-800">
                          {actor}
                        </span>
                        <time
                          dateTime={ev.at}
                          title={ev.at}
                          className="shrink-0 text-[11px] tabular-nums text-stone-400"
                        >
                          {formatRelativeTime(ev.at)}
                        </time>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
                        {formatAuditDetail(ev.detail)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
