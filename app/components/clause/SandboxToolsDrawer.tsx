import {
  IconChevronDown,
  IconCreditCard,
  IconRefresh,
} from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ChargePresetKey } from "@/lib/clause-samples";
import { cn } from "@/lib/utils";

import { formatCurrency } from "./clause-format";
import type { RuntimeInfo } from "./clause-types";

const SANDBOX_PRESETS: ReadonlyArray<{
  key: ChargePresetKey;
  merchant: string;
  mcc: string;
  category: string;
  amount: number;
  note?: string;
}> = [
  {
    key: "lumber",
    merchant: "Dunn Lumber",
    mcc: "5211",
    category: "Lumber & building materials",
    amount: 1840.5,
  },
  {
    key: "lunch",
    merchant: "Kirkland Taphouse",
    mcc: "5812",
    category: "Restaurants & dining",
    amount: 86.4,
  },
  {
    key: "home-depot",
    merchant: "Home Depot",
    mcc: "5200",
    category: "Home supply warehouse",
    amount: 2500,
  },
  {
    key: "after-deadline",
    merchant: "McLendon Hardware",
    mcc: "5251",
    category: "Hardware · Dec 24, 2026",
    amount: 120,
  },
];

interface SandboxToolsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCharge: boolean;
  busy: boolean;
  currency?: string | undefined;
  runtime?: RuntimeInfo | undefined;
  onRunPresetCharge: (preset: ChargePresetKey) => void;
  onRunCustomCharge: (input: {
    merchantName: string;
    mcc: string;
    amount: number;
  }) => void;
  onResetWorkspace: () => void;
}

export function SandboxToolsDrawer({
  open,
  onOpenChange,
  canCharge,
  busy,
  currency = "USD",
  runtime,
  onRunPresetCharge,
  onRunCustomCharge,
  onResetWorkspace,
}: SandboxToolsDrawerProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [merchantName, setMerchantName] = useState("builders Supply Co.");
  const [mcc, setMcc] = useState("5211");
  const [amountStr, setAmountStr] = useState("450");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col border-[#E5DFD2] bg-[#FAF8F3] p-0 text-stone-900 sm:max-w-md"
      >
        <div className="border-b border-[#E6E0D4] px-6 py-5">
          <SheetTitle className="text-base font-semibold text-stone-900">
            Test transactions
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-stone-600">
            Send test card authorizations against the active contract’s
            live Airwallex controls.
          </SheetDescription>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5 text-xs">
          {!canCharge ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-900">
              Approve &amp; issue a virtual card first to run test
              authorizations.
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
              Preset card charges
            </div>
            <div className="space-y-2">
              {SANDBOX_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  data-charge={preset.key}
                  type="button"
                  disabled={!canCharge || busy}
                  onClick={() => onRunPresetCharge(preset.key)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border border-[#E4DECFE6] bg-white px-3.5 py-3 text-left transition-all hover:border-[#0F7B55]/40 hover:shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/45 disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F1EA] text-stone-600">
                      <IconCreditCard className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-stone-900">
                        {preset.merchant}
                      </div>
                      <div className="truncate text-[11px] text-stone-500">
                        MCC {preset.mcc} · {preset.category}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-stone-900">
                    {formatCurrency(preset.amount, currency)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom charge disclosure */}
          <div className="rounded-xl border border-[#E6E0D4] bg-white/75">
            <button
              type="button"
              onClick={() => setCustomOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-medium text-stone-700 hover:text-stone-900"
            >
              <span>Custom authorization</span>
              <IconChevronDown
                className={cn(
                  "size-3.5 text-stone-400 transition-transform",
                  customOpen && "rotate-180",
                )}
              />
            </button>
            {customOpen ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const amt = Number(amountStr);
                  if (!Number.isFinite(amt) || amt <= 0) return;
                  onRunCustomCharge({
                    merchantName: merchantName.trim() || "Custom Merchant",
                    mcc: /^\d{4}$/.test(mcc.trim()) ? mcc.trim() : "5211",
                    amount: amt,
                  });
                }}
                className="space-y-3 border-t border-[#ECE6DA] px-3.5 py-3"
              >
                <div className="space-y-1">
                  <Label htmlFor="customMerchant" className="text-[11px]">
                    Merchant
                  </Label>
                  <Input
                    id="customMerchant"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    className="h-8 bg-white text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="customMcc" className="text-[11px]">
                      4-digit MCC
                    </Label>
                    <Input
                      id="customMcc"
                      maxLength={4}
                      value={mcc}
                      onChange={(e) => setMcc(e.target.value)}
                      className="h-8 bg-white font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="customAmount" className="text-[11px]">
                      Amount ({currency})
                    </Label>
                    <Input
                      id="customAmount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value)}
                      className="h-8 bg-white tabular-nums text-xs"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!canCharge || busy}
                  className="w-full bg-stone-900 text-xs text-white hover:bg-stone-800"
                >
                  Send authorization
                </Button>
              </form>
            ) : null}
          </div>

          {/* Environment & parser diagnostics */}
          <div className="space-y-2 pt-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
              Environment
            </div>
            <dl className="divide-y divide-[#ECE6DA] rounded-xl border border-[#E6E0D4] bg-white/75 px-3.5 py-1 text-xs">
              <div className="flex items-center justify-between gap-2 py-2">
                <dt className="text-stone-500">Issuing gateway</dt>
                <dd className="font-mono text-[11px] text-stone-800">
                  {runtime?.airwallexMode === "sandbox"
                    ? "Airwallex Sandbox"
                    : "Local test gateway"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 py-2">
                <dt className="text-stone-500">Endpoint</dt>
                <dd className="truncate max-w-[210px] font-mono text-[11px] text-stone-600">
                  {runtime?.airwallexBaseUrl ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 py-2">
                <dt className="text-stone-500">Contract parser</dt>
                <dd className="truncate max-w-[210px] font-mono text-[11px] text-stone-800">
                  {runtime?.model ?? "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#E6E0D4] bg-white/80 px-6 py-4">
          <Button
            id="resetDemo"
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onResetWorkspace}
            className="w-full border-[#DCD5C6] bg-white text-xs font-medium text-stone-700 hover:bg-stone-100 hover:text-stone-900"
          >
            <IconRefresh className="size-3.5" />
            Reset workspace
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
