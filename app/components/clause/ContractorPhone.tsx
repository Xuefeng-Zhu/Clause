import {
  IconAlertTriangle,
  IconCamera,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconLock,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { createPortal } from "react-dom";

import { SAMPLE_EXCEPTION_NOTE_TEXT } from "@/lib/clause-samples";
import { cn } from "@/lib/utils";

import {
  formatCardLast4,
  formatContractDate,
  formatCurrency,
  stripLegalSuffix,
} from "./clause-format";
import type { ClauseJob, ClauseTransaction, JobSummary } from "./clause-types";

/**
 * What the contractor (or traveling employee) sees on their phone while the
 * owner/manager works in Clause. Pure view of the same job state, so every
 * live swipe and approval shows up on both sides.
 */
interface ContractorPhoneProps {
  job: ClauseJob | null;
  summary: JobSummary | null;
  isFrozen: boolean;
  onClose: () => void;
  exceptionNote?: string;
  onExceptionNoteChange?: (note: string) => void;
  onRequestException?: () => void;
  busy?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  building_materials: "Building materials",
  lumber: "Lumber",
  hardware: "Hardware",
  plumbing_supplies: "Plumbing",
  electrical_supplies: "Electrical",
  paint_glass: "Paint & glass",
  home_improvement_warehouse: "Home centers",
  lodging: "Hotels & lodging",
  airfare: "Airfare",
  ground_transport: "Ground transport",
  meals: "Business meals",
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

/** Decline reasons in the traveling employee's words, citing policy §. */
function employeeReason(
  txn: ClauseTransaction,
  baseCap: number,
  currency: string,
): string {
  const cid = txn.explanation?.clause_id;
  const clause = cid ? ` (${cid})` : "";
  const reason = txn.failure_reason ?? txn.explanation?.failure_reason;

  if (
    reason === "LIMIT_EXCEEDED" &&
    (txn.explanation?.can_request_exception || cid === "§3.3")
  ) {
    return `Over ${formatCurrency(baseCap, currency)} single-charge cap${clause} · Request an exception (§3.4)`;
  }
  if (txn.explanation?.prohibited) {
    if (cid === "§4.2" || txn.merchant_category_code === "5813") {
      return `Bars & alcohol-only venues aren't covered${clause}`;
    }
    return `Personal, electronics & gift cards aren't covered${clause}`;
  }
  switch (reason) {
    case "MERCHANT_CATEGORY_NOT_ALLOWED":
      return `Outside approved travel categories${clause}`;
    case "LIMIT_EXCEEDED":
      return `Exceeds remaining trip budget${clause}`;
    case "OUT_OF_ALLOWED_TIME_RANGE":
      return `Card expired 48h after return${clause}`;
    case "CURRENCY_NOT_ALLOWED":
      return `Trip currency (${currency}) only${clause}`;
    case "CARD_INACTIVE":
      return "Card paused by manager";
    case "CARD_CLOSED":
      return "Trip card closed";
    default:
      return reason ?? "Declined";
  }
}

const isDeclined = (t: ClauseTransaction) => Boolean(t.failure_reason || t.explanation);

export function ContractorPhone({
  job,
  summary,
  isFrozen,
  onClose,
  exceptionNote,
  onExceptionNoteChange,
  onRequestException,
  busy = false,
}: ContractorPhoneProps) {
  const isPolicy = job?.kind === "policy" || summary?.kind === "policy";
  const currency = summary?.currency ?? "USD";
  const rawTxns = job?.transactions ?? [];
  const txns = [...rawTxns].reverse();
  const latest = txns[0];
  const hasCard = Boolean(summary?.cardId) && summary?.status !== "draft";
  const pending = job?.pending ?? summary?.pending ?? null;
  const next = summary?.nextMilestone ?? null;
  const categories = isPolicy
    ? (job?.policyTerms?.allowed_spend.categories ??
      job?.terms.allowed_spend.categories ??
      [])
    : (job?.terms.allowed_spend.categories ?? []);

  const baseCap =
    summary?.basePerChargeCap ??
    job?.policyTerms?.per_charge_cap.amount ??
    300;
  const currentCap = summary?.perChargeCap ?? baseCap;
  const activeException =
    job?.activeException ?? summary?.activeException ?? null;

  let lastCapDeclineIdx = -1;
  let lastExceptionSwipeIdx = -1;
  if (isPolicy) {
    rawTxns.forEach((t, idx) => {
      const reason = t.failure_reason ?? t.explanation?.failure_reason;
      if (
        isDeclined(t) &&
        reason === "LIMIT_EXCEEDED" &&
        (t.explanation?.can_request_exception ||
          t.explanation?.clause_id === "§3.3")
      ) {
        lastCapDeclineIdx = idx;
      } else if (!isDeclined(t) && t.amount > baseCap) {
        lastExceptionSwipeIdx = idx;
      }
    });
  }

  const canRequestException =
    isPolicy &&
    hasCard &&
    lastCapDeclineIdx >= 0 &&
    lastCapDeclineIdx > lastExceptionSwipeIdx &&
    pending?.kind !== "policy_exception" &&
    !activeException;

  const hasUsedException = Boolean(
    job?.events?.some((ev) => ev.type === "exception_used"),
  );

  const travelerFirstName =
    (summary?.contractor ?? "Priya").trim().split(/\s+/)[0] || "Priya";

  if (typeof document === "undefined") return null;
  // Portal to <body> so the phone sits above the Sandbox drawer's blurred overlay.
  return createPortal(
    <div
      id="contractorPhone"
      aria-label={isPolicy ? "Employee phone view" : "Contractor phone view"}
      className="pointer-events-auto fixed bottom-5 left-16 z-[60] w-[292px] select-none"
    >
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
          {isPolicy ? `Employee's phone — ${travelerFirstName}` : "Contractor’s phone"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={isPolicy ? "Hide employee phone" : "Hide contractor phone"}
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
              {isPolicy ? "Clause · Trip card" : "Clause · Job card"}
            </div>
            <div className="truncate text-[15px] font-semibold text-stone-900">
              {summary?.contractor ?? (isPolicy ? "Traveler" : "Contractor")}
            </div>
            <div className="truncate text-[11px] text-stone-500">
              {summary
                ? isPolicy
                  ? `${summary.project} · ${stripLegalSuffix(summary.client)}`
                  : `${summary.project} · for ${summary.client}`
                : "No active job"}
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
                  ? isPolicy
                    ? `of ${formatCurrency(summary?.released ?? 0, currency)} budget · ${formatCurrency(currentCap, currency)}/swipe · exp ${formatContractDate(summary?.deadline)}`
                    : `of ${formatCurrency(summary?.released ?? 0, currency)} released · until ${formatContractDate(summary?.deadline)}`
                  : isPolicy
                    ? "Card activates when trip is approved"
                    : "Card arrives when the owner signs"}
              </div>
              {isFrozen ? (
                <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-stone-900/55 text-[12px] font-semibold">
                  <IconLock className="size-4" /> {isPolicy ? "Paused by manager" : "Paused by owner"}
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-3 pt-2.5">
            {/* push notification for the latest swipe */}
            {latest ? (
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
                  <div className="mt-0.5 text-[11px] leading-snug text-red-700">
                    {isPolicy
                      ? employeeReason(latest, baseCap, currency)
                      : contractorReason(latest)}
                  </div>
                ) : isPolicy ? (
                  <div className="mt-0.5 text-[10px] text-[#0F7B55]">
                    In policy · no expense report needed
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Policy exception card OR Contract next payout */}
            {isPolicy ? (
              <div className="rounded-xl bg-white px-3 py-2.5 shadow-2xs ring-1 ring-stone-900/5">
                {pending?.kind === "policy_exception" ? (
                  <>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-400">
                      Exception requested · {pending.exception?.clause.clause_id ?? "§3.4"}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-stone-900">
                      Up to{" "}
                      {formatCurrency(
                        pending.exception?.one_time_cap ?? 500,
                        currency,
                      )}{" "}
                      for {pending.exception?.client ?? "client dinner"}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-700">
                      <IconClock className="size-3.5 shrink-0" />
                      <span>
                        Waiting on {summary?.approver ?? "manager"}
                      </span>
                    </div>
                  </>
                ) : activeException ? (
                  <>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#0F7B55]">
                      Exception approved · {activeException.clause.clause_id}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-stone-900">
                      One charge up to{" "}
                      {formatCurrency(activeException.one_time_cap, currency)}{" "}
                      unlocked
                    </div>
                    <div className="mt-0.5 text-[10px] text-stone-500">
                      Retry the restaurant terminal now; cap resets to{" "}
                      {formatCurrency(activeException.base_per_charge_cap, currency)}{" "}
                      right after.
                    </div>
                  </>
                ) : canRequestException ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                        Client entertainment · §3.4
                      </span>
                      <span className="text-[10px] text-stone-400">
                        $125 / attendee
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      aria-label="Client dinner exception note"
                      value={exceptionNote ?? SAMPLE_EXCEPTION_NOTE_TEXT}
                      onChange={(e) => onExceptionNoteChange?.(e.target.value)}
                      className="w-full select-text resize-none rounded-lg border border-stone-200 bg-[#FAF8F3] px-2 py-1.5 text-[11px] leading-snug text-stone-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0F7B55]"
                    />
                    <button
                      id="requestException"
                      type="button"
                      disabled={busy || !onRequestException}
                      onClick={onRequestException}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0F7B55] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-2xs transition-colors hover:bg-[#0C6646] disabled:opacity-50"
                    >
                      <IconSparkles className="size-3.5" />
                      <span>Request an exception (§3.4)</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-400">
                      Single-charge limit
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-semibold tabular-nums text-stone-900">
                        {formatCurrency(currentCap, currency)} max per swipe
                      </span>
                      <span className="text-[10px] font-semibold text-stone-500">
                        {job?.policyTerms?.per_charge_cap.clause.clause_id ?? "§3.3"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-stone-500">
                      {hasUsedException
                        ? `Exception used — per-charge cap back to ${formatCurrency(baseCap, currency)}`
                        : "Client meals up to $125/attendee with manager approval (§3.4)"}
                    </div>
                  </>
                )}
              </div>
            ) : (
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
            )}

            {/* what the card covers */}
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-400">
                This card works at
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {categories.slice(0, 5).map((c) => (
                  <span key={c} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-[#0F7B55]">
                    {CATEGORY_LABELS[c] ?? c.replace(/_/g, " ")}
                  </span>
                ))}
                {isPolicy ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                    <IconAlertTriangle className="size-3" /> No bars, electronics, gift cards
                  </span>
                ) : job?.terms.prohibited_spend ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                    <IconAlertTriangle className="size-3" /> No meals, travel, fuel
                  </span>
                ) : null}
              </div>
            </div>

            {/* recent */}
            <div>
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
      </div>
    </div>,
    document.body,
  );
}
