import {
  IconAlertTriangle,
  IconCamera,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconLock,
  IconX,
} from "@tabler/icons-react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import {
  formatCardLast4,
  formatContractDate,
  formatCurrency,
} from "./clause-format";
import type { ClauseJob, ClauseTransaction, JobSummary } from "./clause-types";

/**
 * What the contractor sees on their phone while the owner works in Clause.
 * Pure view of the same job state, so every live swipe shows up on both sides.
 */
interface ContractorPhoneProps {
  job: ClauseJob | null;
  summary: JobSummary | null;
  isFrozen: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  building_materials: "Building materials",
  lumber: "Lumber",
  hardware: "Hardware",
  plumbing_supplies: "Plumbing",
  electrical_supplies: "Electrical",
  paint_glass: "Paint & glass",
  home_improvement_warehouse: "Home centers",
};

/** Decline reasons in the contractor's words, not the network's. */
function contractorReason(txn: ClauseTransaction): string {
  const clause = txn.explanation?.clause_id ? ` (${txn.explanation.clause_id})` : "";
  const reason = txn.failure_reason ?? txn.explanation?.failure_reason;
  if (txn.explanation?.prohibited) return `Meals, travel & fuel aren't covered${clause}`;
  switch (reason) {
    case "MERCHANT_CATEGORY_NOT_ALLOWED":
      return `Only building-supply stores${clause}`;
    case "LIMIT_EXCEEDED":
      return `Over what's released so far${clause}`;
    case "OUT_OF_ALLOWED_TIME_RANGE":
      return `Past the contract deadline${clause}`;
    case "CURRENCY_NOT_ALLOWED":
      return `Contract currency only${clause}`;
    case "CARD_INACTIVE":
      return "Owner paused this card";
    case "CARD_CLOSED":
      return "Card closed";
    default:
      return reason ?? "Declined";
  }
}

const isDeclined = (t: ClauseTransaction) => Boolean(t.failure_reason || t.explanation);

export function ContractorPhone({ job, summary, isFrozen, onClose }: ContractorPhoneProps) {
  const currency = summary?.currency ?? "USD";
  const txns = [...(job?.transactions ?? [])].reverse();
  const latest = txns[0];
  const hasCard = Boolean(summary?.cardId) && summary?.status !== "draft";
  const pending = job?.pending ?? summary?.pending ?? null;
  const next = summary?.nextMilestone ?? null;
  const categories = job?.terms.allowed_spend.categories ?? [];

  if (typeof document === "undefined") return null;
  // Portal to <body> so the phone sits above the Sandbox drawer's blurred overlay.
  return createPortal(
    <div
      id="contractorPhone"
      aria-label="Contractor phone view"
      className="pointer-events-auto fixed bottom-5 left-16 z-[60] w-[292px] select-none"
    >
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
          Contractor’s phone
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide contractor phone"
          className="rounded-full bg-white/90 p-1 text-stone-500 shadow-2xs hover:text-stone-900"
        >
          <IconX className="size-3" />
        </button>
      </div>

      <div className="rounded-[38px] bg-stone-900 p-[7px] shadow-[0_24px_60px_-20px_rgba(28,25,23,0.55)]">
        <div className="relative flex h-[560px] flex-col overflow-hidden rounded-[32px] bg-[#F6F4EF]">
          {/* status bar */}
          <div className="flex items-center justify-between px-6 pt-3 text-[11px] font-semibold text-stone-900">
            <span>9:41</span>
            <span className="h-[18px] w-[76px] rounded-full bg-stone-900" />
            <span className="tabular-nums">5G</span>
          </div>

          <div className="px-4 pt-3">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-400">
              Clause · Job card
            </div>
            <div className="truncate text-[15px] font-semibold text-stone-900">
              {summary?.contractor ?? "Contractor"}
            </div>
            <div className="truncate text-[11px] text-stone-500">
              {summary ? `${summary.project} · for ${summary.client}` : "No active job"}
            </div>
          </div>

          {/* card */}
          <div className="px-4 pt-3">
            <div
              className={cn(
                "relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F3D2E] to-[#0B241B] p-3.5 text-white",
                (isFrozen || !hasCard) && "opacity-70 grayscale",
              )}
            >
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <span className="tracking-wider tabular-nums">
                  •••• {hasCard ? formatCardLast4(summary?.cardId) : "----"}
                </span>
                <span className="text-[14px] font-extrabold italic tracking-tight text-white">VISA</span>
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-[0.08em] text-white/60">
                Available to spend
              </div>
              <div data-phone-available className="text-[24px] font-semibold leading-tight tabular-nums">
                {hasCard ? formatCurrency(summary?.available ?? 0, currency) : "—"}
              </div>
              <div className="mt-0.5 text-[10px] text-white/60 tabular-nums">
                {hasCard
                  ? `of ${formatCurrency(summary?.released ?? 0, currency)} released · until ${formatContractDate(summary?.deadline)}`
                  : "Card arrives when the owner signs"}
              </div>
              {isFrozen ? (
                <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-stone-900/55 text-[12px] font-semibold">
                  <IconLock className="size-4" /> Paused by owner
                </div>
              ) : null}
            </div>
          </div>

          {/* push notification for the latest swipe */}
          {latest ? (
            <div className="px-4 pt-2.5">
              <div
                key={latest.transaction_id}
                data-phone-latest={isDeclined(latest) ? "declined" : "approved"}
                className={cn(
                  "animate-in fade-in slide-in-from-top-2 rounded-xl border px-3 py-2 shadow-2xs duration-300",
                  isDeclined(latest)
                    ? "border-red-200 bg-red-50"
                    : "border-emerald-200 bg-emerald-50",
                )}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                  {isDeclined(latest) ? (
                    <IconCircleX className="size-3.5 text-red-600" />
                  ) : (
                    <IconCircleCheck className="size-3.5 text-[#0F7B55]" />
                  )}
                  <span className={isDeclined(latest) ? "text-red-700" : "text-[#0F7B55]"}>
                    {isDeclined(latest) ? "Declined" : "Approved"}
                  </span>
                  <span className="ms-auto tabular-nums text-stone-900">
                    {formatCurrency(latest.amount, latest.currency)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-stone-700">{latest.merchant_name}</div>
                {isDeclined(latest) ? (
                  <div className="mt-0.5 text-[11px] leading-snug text-red-700">{contractorReason(latest)}</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* next payout */}
          <div className="px-4 pt-2.5">
            <div className="rounded-xl bg-white px-3 py-2.5 shadow-2xs ring-1 ring-stone-900/5">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-400">
                Next payout
              </div>
              {next ? (
                <>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-semibold text-stone-900">{next.name}</span>
                    <span className="text-[12px] font-semibold tabular-nums text-stone-900">
                      {formatCurrency(next.amount, currency)}
                    </span>
                  </div>
                  {pending?.kind === "release_milestone" ? (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-700">
                      <IconClock className="size-3.5" /> Proof sent · waiting on owner
                    </div>
                  ) : (
                    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-medium text-white">
                      <IconCamera className="size-3.5" />
                      Send {next.evidenceRequired.join(" + ").replace(/_/g, " ")} ({next.clauseId})
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-0.5 text-[12px] text-stone-600">
                  {hasCard ? "All milestones released" : "—"}
                </div>
              )}
            </div>
          </div>

          {/* what the card covers */}
          <div className="px-4 pt-2.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-400">
              This card works at
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {categories.slice(0, 5).map((c) => (
                <span key={c} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-[#0F7B55]">
                  {CATEGORY_LABELS[c] ?? c.replace(/_/g, " ")}
                </span>
              ))}
              {job?.terms.prohibited_spend ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                  <IconAlertTriangle className="size-3" /> No meals, travel, fuel
                </span>
              ) : null}
            </div>
          </div>

          {/* recent */}
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3 pt-2.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-400">Recent</div>
            <ul className="mt-1 divide-y divide-stone-200/70">
              {txns.slice(1, 4).map((t) => (
                <li key={t.transaction_id} className="flex items-center justify-between gap-2 py-1.5 text-[11px]">
                  <span className="truncate text-stone-700">{t.merchant_name}</span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      isDeclined(t) ? "text-red-600 line-through" : "text-stone-900",
                    )}
                  >
                    {formatCurrency(t.amount, t.currency)}
                  </span>
                </li>
              ))}
              {txns.length <= 1 ? (
                <li className="py-1.5 text-[11px] text-stone-400">No earlier swipes</li>
              ) : null}
            </ul>
          </div>

        </div>
      </div>
    </div>,
    document.body,
  );
}
