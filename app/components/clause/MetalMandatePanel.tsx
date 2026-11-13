import { IconShieldCheck } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

interface ClauseRefLite {
  clause_id: string;
  quote: string;
}

interface MandateEventLite {
  id: string;
  at: string;
  kind: "issued" | "payout" | "refused" | "replaced" | "verified";
  outcome?: string;
  milestoneId?: string;
  amount?: number;
  amountUsd?: number;
  to?: string;
  reason?: string;
  clause?: ClauseRefLite;
  txHash?: string;
  explorerUrl?: string | null;
  detail: string;
}

export interface MandateStateLite {
  mode: "mock" | "testnet";
  mandateId: string;
  version: number;
  explorerUrl: string | null;
  terms: {
    payee: string;
    payeeName: string;
    cap: number;
    capUsd: number;
    budget: number;
    budgetUsd: number;
    maxOccurrences: number;
    expiresAt: string;
    deadlineDate: string;
    clauses: {
      payee: ClauseRefLite;
      cap: ClauseRefLite;
      budget: ClauseRefLite;
      maxOccurrences: ClauseRefLite;
      expiresIn: ClauseRefLite;
    };
  };
  spent: number;
  budget: number;
  occurrencesUsed: number;
  revoked?: boolean;
  verified?: {
    ok: boolean;
    at: string;
    payments: number;
    refusals: number;
    summary: string;
  };
  events: MandateEventLite[];
}

function short(s: string): string {
  return s.length <= 14 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function usdz(n: number): string {
  return `${n.toFixed(2)} USDZ`;
}

function Row({
  label,
  value,
  clause,
  onSelectClause,
}: {
  label: string;
  value: string;
  clause?: ClauseRefLite | undefined;
  onSelectClause?: ((id: string) => void) | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <dt className="text-stone-500">{label}</dt>
      <dd className="flex items-center gap-2 text-right">
        <span className="font-medium tabular-nums text-stone-900">{value}</span>
        {clause ? (
          <button
            type="button"
            title={clause.quote}
            onClick={() => onSelectClause?.(clause.clause_id)}
            className="rounded bg-[#EBF4EE] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0F7B55] hover:bg-[#DCEDE3]"
          >
            {clause.clause_id}
          </button>
        ) : null}
      </dd>
    </div>
  );
}

export function MetalMandatePanel({
  mandate,
  onSelectClause,
}: {
  mandate: MandateStateLite;
  onSelectClause?: ((id: string) => void) | undefined;
}) {
  const { terms } = mandate;
  const pct =
    mandate.budget > 0
      ? Math.min(100, Math.round((mandate.spent / mandate.budget) * 100))
      : 0;
  const events = [...mandate.events].reverse();

  return (
    <section
      id="metalPanel"
      className="mt-4 rounded-2xl border border-[#E6E0D4] bg-white/90 p-4 text-xs shadow-2xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[#EBF4EE] text-[#0F7B55]">
            <IconShieldCheck className="size-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-stone-900">
              Metal payout mandate
            </div>
            <div className="text-[11px] text-stone-500">
              {mandate.mode === "testnet"
                ? "Metal testnet · on-chain limits"
                : "Metal rail · simulated"}{" "}
              · v{mandate.version}
              {mandate.revoked ? " · revoked" : ""}
            </div>
          </div>
        </div>
        {mandate.verified ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              mandate.verified.ok
                ? "bg-[#EBF4EE] text-[#0F7B55]"
                : "bg-red-50 text-red-700",
            )}
            title={mandate.verified.summary}
          >
            {mandate.verified.ok ? "Verified" : "Verify failed"}
          </span>
        ) : null}
      </div>

      <dl className="mt-3 divide-y divide-[#ECE6DA]">
        <Row
          label="Payee"
          value={`${terms.payeeName} ${short(terms.payee)}`}
          clause={terms.clauses.payee}
          onSelectClause={onSelectClause}
        />
        <Row
          label="Per payout cap"
          value={usdz(terms.cap)}
          clause={terms.clauses.cap}
          onSelectClause={onSelectClause}
        />
        <Row
          label="Total budget"
          value={usdz(terms.budget)}
          clause={terms.clauses.budget}
          onSelectClause={onSelectClause}
        />
        <Row
          label="Max payouts"
          value={`${mandate.occurrencesUsed} of ${terms.maxOccurrences}`}
          clause={terms.clauses.maxOccurrences}
          onSelectClause={onSelectClause}
        />
        <Row
          label="Expires"
          value={terms.deadlineDate}
          clause={terms.clauses.expiresIn}
          onSelectClause={onSelectClause}
        />
      </dl>

      <div id="metalSpent" className="mt-3" data-spent={mandate.spent}>
        <div className="flex justify-between text-[11px] text-stone-500">
          <span>Paid out</span>
          <span className="tabular-nums text-stone-800">
            {usdz(mandate.spent)} / {usdz(mandate.budget)}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F1ECE2]">
          <div
            className="h-full rounded-full bg-[#0F7B55] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ul id="metalEvents" className="mt-3 space-y-1.5">
        {events.length === 0 ? (
          <li className="text-[11px] text-stone-400">No mandate activity yet.</li>
        ) : (
          events.map((ev) => (
            <li
              key={ev.id}
              data-kind={ev.kind}
              className={cn(
                "rounded-lg border px-2.5 py-1.5",
                ev.kind === "refused"
                  ? "border-red-200 bg-red-50/70"
                  : "border-[#ECE6DA] bg-[#FAF8F3]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "font-semibold",
                    ev.kind === "refused" ? "text-red-700" : "text-stone-800",
                  )}
                >
                  {ev.kind === "payout"
                    ? `Paid ${ev.amount != null ? usdz(ev.amount) : ""}`
                    : ev.kind === "refused"
                      ? "Refused on chain"
                      : ev.kind === "issued"
                        ? "Mandate issued"
                        : ev.kind === "replaced"
                          ? "Mandate replaced"
                          : "Verified"}
                </span>
                {ev.txHash ? (
                  ev.explorerUrl ? (
                    <a
                      href={ev.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10px] text-[#0F7B55] underline"
                    >
                      {short(ev.txHash)}
                    </a>
                  ) : (
                    <span className="font-mono text-[10px] text-stone-500">
                      {short(ev.txHash)}
                    </span>
                  )
                ) : null}
              </div>
              {ev.reason ? (
                <div className="mt-0.5 font-mono text-[10px] text-red-700">
                  {ev.reason}
                  {ev.clause ? ` · ${ev.clause.clause_id}` : ""}
                </div>
              ) : null}
              <div className="mt-0.5 text-[11px] text-stone-500">{ev.detail}</div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
