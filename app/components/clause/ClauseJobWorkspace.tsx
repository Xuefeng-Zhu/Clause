import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import {
  IconAlertTriangle,
  IconCheck,
  IconCreditCard,
  IconFileText,
  IconLoader2,
  IconLock,
  IconMessageChatbot,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconShieldCheck,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  type ChargePresetKey,
  type DeclaredProofKind,
  PRESET_CHARGES,
  PROOF_KIND_OPTIONS,
  SAMPLE_CHANGE_ORDER_EMAIL_TEXT,
  SAMPLE_QUOTE_TEXT,
} from "@/lib/clause-samples";
import { cn } from "@/lib/utils";

type UploadableProofFile = {
  filename: string;
  mediaType: "image/jpeg" | "image/png" | "application/pdf";
  base64: string;
  declaredKind: DeclaredProofKind;
};

function formatMoney(amount: number, currency = "USD"): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function inferMediaType(
  file: File,
): "image/jpeg" | "image/png" | "application/pdf" {
  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    return "application/pdf";
  }
  if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) {
    return "image/png";
  }
  return "image/jpeg";
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = typeof reader.result === "string" ? reader.result : "";
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () =>
      reject(new Error(`Could not read file ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function ClauseJobWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlJobId = searchParams.get("job")?.trim() || "";

  const listQuery = useActionQuery("list-jobs", {});
  const jobs = listQuery.data?.jobs ?? [];
  const runtime = listQuery.data?.runtime;

  const activeJobId =
    (urlJobId && jobs.some((j) => j.id === urlJobId) ? urlJobId : "") ||
    jobs[0]?.id ||
    "";

  useEffect(() => {
    if (activeJobId && urlJobId !== activeJobId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("job", activeJobId);
          return next;
        },
        { replace: true },
      );
    } else if (!activeJobId && urlJobId && !listQuery.isLoading) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("job");
          return next;
        },
        { replace: true },
      );
    }
  }, [activeJobId, listQuery.isLoading, setSearchParams, urlJobId]);

  const jobQuery = useActionQuery(
    "get-job",
    { jobId: activeJobId },
    { enabled: Boolean(activeJobId) },
  );

  const summary =
    jobQuery.data?.summary ?? jobs.find((j) => j.id === activeJobId) ?? null;
  const job = jobQuery.data?.job ?? null;

  // Mutations for all Clause write actions
  const parseQuoteMut = useActionMutation("parse-quote");
  const approveTermsMut = useActionMutation("approve-terms");
  const simulateChargeMut = useActionMutation("simulate-charge");
  const submitProofMut = useActionMutation("submit-proof");
  const approveReleaseMut = useActionMutation("approve-release");
  const rejectPendingMut = useActionMutation("reject-pending");
  const draftCoMut = useActionMutation("draft-change-order");
  const approveCoMut = useActionMutation("approve-change-order");
  const freezeCardMut = useActionMutation("freeze-card");
  const closeJobMut = useActionMutation("close-job");
  const resetDemoMut = useActionMutation("reset-demo");

  // Local form state
  const [quoteText, setQuoteText] = useState(SAMPLE_QUOTE_TEXT);
  const [quotePanelOpen, setQuotePanelOpen] = useState(true);
  const [coEmailText, setCoEmailText] = useState(SAMPLE_CHANGE_ORDER_EMAIL_TEXT);
  const [proofKind, setProofKind] = useState<DeclaredProofKind>("photos");
  const [stagedProofFiles, setStagedProofFiles] = useState<
    UploadableProofFile[]
  >([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const proofInputRef = useRef<HTMLInputElement>(null);

  // Sync quote disclosure & recommended proofKind when active job changes
  useEffect(() => {
    setQuotePanelOpen(!activeJobId);
  }, [activeJobId]);

  const nextReqKind = summary?.nextMilestone?.evidenceRequired?.[0] as
    | DeclaredProofKind
    | undefined;
  useEffect(() => {
    if (nextReqKind) {
      setProofKind(nextReqKind);
    }
  }, [nextReqKind]);

  // Immediate (<100ms) single-slot operation guard with overlap rejection & cancellation
  const activeOpRef = useRef<{ id: number; label: string } | null>(null);
  const nextOpIdRef = useRef(0);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  function cancelActiveOp() {
    if (!activeOpRef.current) return;
    activeOpRef.current = null;
    setBusyLabel(null);
    setStatusNote("Operation cancelled; slot is ready.");
  }

  async function runExclusive<T>(
    label: string,
    work: () => Promise<T>,
    onDone?: (result: T) => void,
  ): Promise<void> {
    if (activeOpRef.current) {
      toast.info(`Busy: "${activeOpRef.current.label}" is already running.`);
      return;
    }
    const id = ++nextOpIdRef.current;
    activeOpRef.current = { id, label };
    setBusyLabel(label);
    setErrorBanner(null);
    setStatusNote(null);

    try {
      const result = await work();
      if (activeOpRef.current?.id !== id) return;
      onDone?.(result);
    } catch (err) {
      if (activeOpRef.current?.id !== id) return;
      const msg =
        actionErrorMessage(err) ??
        (err instanceof Error ? err.message : "Operation failed.");
      setErrorBanner(msg);
      toast.error(msg);
    } finally {
      if (activeOpRef.current?.id === id) {
        activeOpRef.current = null;
        setBusyLabel(null);
      }
    }
  }

  // Derive card freeze state from event log
  const isCardFrozen = (() => {
    if (!job?.events?.length) return false;
    for (let i = job.events.length - 1; i >= 0; i--) {
      const ev = job.events[i];
      if (ev?.type === "card_frozen") {
        return ev.detail.toLowerCase().includes("frozen by owner") &&
          !ev.detail.toLowerCase().includes("unfrozen");
      }
    }
    return false;
  })();

  const isDraft = summary?.status === "draft";
  const isActive = summary?.status === "active";
  const pending = job?.pending ?? summary?.pending ?? null;
  const pendingRelease =
    pending?.kind === "release_milestone" ? pending : null;
  const pendingCo = pending?.kind === "change_order" ? pending : null;

  async function handleParseQuote() {
    const trimmed = quoteText.trim();
    await runExclusive(
      "Parsing contractor quote…",
      () =>
        parseQuoteMut.mutateAsync(
          trimmed ? { text: trimmed } : { useSample: true },
        ),
      (res) => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("job", res.summary.id);
            return next;
          },
          { replace: true },
        );
        setQuotePanelOpen(false);
        setStatusNote(
          `Extracted ${res.terms.milestones.length} milestones from ${res.summary.contractRef}. Review clauses and issue card.`,
        );
      },
    );
  }

  async function handleApproveTerms() {
    if (!activeJobId) return;
    await runExclusive(
      "Issuing Airwallex virtual card…",
      () => approveTermsMut.mutateAsync({ jobId: activeJobId }),
      (res) => {
        setStatusNote(
          `Virtual card ${res.summary.cardId ?? ""} issued with ${formatMoney(res.summary.released, res.summary.currency)} deposit limit.`,
        );
      },
    );
  }

  async function handleSimulateCharge(preset: ChargePresetKey) {
    if (!activeJobId) return;
    const presetMeta = PRESET_CHARGES.find((p) => p.key === preset);
    await runExclusive(
      `Simulating ${presetMeta?.label ?? preset}…`,
      () =>
        simulateChargeMut.mutateAsync({
          jobId: activeJobId,
          preset,
        }),
      (res) => {
        if (res.approved) {
          setStatusNote(
            `Approved ${formatMoney(res.txn.amount, res.txn.currency)} at ${res.txn.merchant_name}.`,
          );
        } else if (res.explanation) {
          setStatusNote(
            `${res.explanation.headline}${res.explanation.clause_id ? ` (${res.explanation.clause_id})` : ""}`,
          );
        }
      },
    );
  }

  async function collectInputFiles(): Promise<UploadableProofFile[]> {
    const rawList = proofInputRef.current?.files;
    if (!rawList || rawList.length === 0) return [];
    const converted: UploadableProofFile[] = [];
    for (const file of Array.from(rawList)) {
      const base64 = await readFileAsBase64(file);
      converted.push({
        filename: file.name,
        mediaType: inferMediaType(file),
        base64: base64 || "AA==",
        declaredKind: proofKind,
      });
    }
    return converted;
  }

  async function handleStageSelectedFiles() {
    try {
      const fromInput = await collectInputFiles();
      if (!fromInput.length) return;
      setStagedProofFiles((prev) => [...prev, ...fromInput]);
      if (proofInputRef.current) proofInputRef.current.value = "";
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Could not read file");
    }
  }

  async function handleSubmitProof() {
    if (!activeJobId) return;
    await runExclusive(
      "Evaluating milestone evidence…",
      async () => {
        const fromInput = await collectInputFiles();
        const combined = [...stagedProofFiles, ...fromInput];
        const filesToSend: UploadableProofFile[] =
          combined.length > 0
            ? combined
            : [
                {
                  filename:
                    proofKind === "inspection_report"
                      ? "kirkland-final-inspection.pdf"
                      : `${proofKind}-evidence.jpg`,
                  mediaType:
                    proofKind === "inspection_report"
                      ? "application/pdf"
                      : "image/jpeg",
                  base64: "AA==",
                  declaredKind: proofKind,
                },
              ];
        return submitProofMut.mutateAsync({
          jobId: activeJobId,
          files: filesToSend,
        });
      },
      (res) => {
        setStagedProofFiles([]);
        if (proofInputRef.current) proofInputRef.current.value = "";
        const verdict = res.pending?.verdict?.verdict ?? "reviewed";
        setStatusNote(
          `Proof evaluated (${verdict}). Bound owner approval is ready below.`,
        );
      },
    );
  }

  async function handleApproveRelease() {
    if (!activeJobId || !pendingRelease || !pendingRelease.milestone_id || pendingRelease.amount === undefined) {
      return;
    }
    const milestoneId = pendingRelease.milestone_id;
    const amount = pendingRelease.amount;
    await runExclusive(
      `Releasing ${milestoneId} and updating card limit…`,
      () =>
        approveReleaseMut.mutateAsync({
          jobId: activeJobId,
          approvalId: pendingRelease.approval_id,
          milestoneId,
          amount,
          currency: pendingRelease.currency,
          ...(pendingRelease.evidence_sha256
            ? { evidenceSha256: pendingRelease.evidence_sha256 }
            : {}),
        }),
      (res) => {
        setStatusNote(
          `Released ${milestoneId}. Card limit raised to ${formatMoney(res.summary.released, res.summary.currency)}.`,
        );
      },
    );
  }

  async function handleDraftChangeOrder() {
    if (!activeJobId) return;
    const trimmed = coEmailText.trim();
    await runExclusive(
      "Drafting change order from contractor email…",
      () =>
        draftCoMut.mutateAsync(
          trimmed
            ? { jobId: activeJobId, emailText: trimmed }
            : { jobId: activeJobId, useSample: true },
        ),
      () => {
        setStatusNote(
          "Change order drafted. Card controls stay unchanged until owner approval.",
        );
      },
    );
  }

  async function handleApproveChangeOrder() {
    if (!activeJobId || !pendingCo) return;
    await runExclusive(
      "Applying change order to Airwallex card…",
      () =>
        approveCoMut.mutateAsync({
          jobId: activeJobId,
          approvalId: pendingCo.approval_id,
        }),
      (res) => {
        setStatusNote(
          `Change order applied: total ${formatMoney(res.summary.total, res.summary.currency)}, deadline ${res.summary.deadline}.`,
        );
      },
    );
  }

  async function handleRejectPending() {
    if (!activeJobId || !pending) return;
    await runExclusive(
      "Rejecting pending proposal…",
      () =>
        rejectPendingMut.mutateAsync({
          jobId: activeJobId,
          reason: "Declined by owner in job workspace",
        }),
      () => {
        setStatusNote("Pending proposal rejected; card controls unchanged.");
      },
    );
  }

  async function handleToggleFreeze() {
    if (!activeJobId) return;
    const nextFrozen = !isCardFrozen;
    await runExclusive(
      nextFrozen ? "Freezing card…" : "Unfreezing card…",
      () =>
        freezeCardMut.mutateAsync({
          jobId: activeJobId,
          frozen: nextFrozen,
        }),
      () => {
        setStatusNote(
          nextFrozen
            ? "Card frozen (INACTIVE). All swipes will decline."
            : "Card unfrozen (ACTIVE).",
        );
      },
    );
  }

  async function handleCloseJob() {
    if (!activeJobId) return;
    await runExclusive(
      "Closing job and virtual card…",
      () => closeJobMut.mutateAsync({ jobId: activeJobId }),
      () => {
        setStatusNote("Job and virtual card permanently closed.");
      },
    );
  }

  async function handleResetDemo() {
    await runExclusive(
      "Resetting demo workspace…",
      () => resetDemoMut.mutateAsync({}),
      () => {
        setStagedProofFiles([]);
        setQuoteText(SAMPLE_QUOTE_TEXT);
        setCoEmailText(SAMPLE_CHANGE_ORDER_EMAIL_TEXT);
        setQuotePanelOpen(true);
        setSearchParams(new URLSearchParams(), { replace: true });
        setStatusNote("Demo reset. Ready to parse a quote.");
      },
    );
  }

  function askClauseAboutDecline(txnId: string, headline: string) {
    if (!activeJobId) return;
    sendToAgentChat({
      message: `Explain why this card swipe was declined and cite the contract clause: "${headline}"`,
      context: JSON.stringify({ jobId: activeJobId, transactionId: txnId }),
      submit: true,
      openSidebar: true,
    });
  }

  const latestTxn = job?.transactions?.[job.transactions.length - 1] ?? null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
      {/* Top workspace bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <IconShieldCheck className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-tight">
                {summary
                  ? `${summary.contractRef} · ${summary.client}`
                  : "Contract-as-Card"}
              </h1>
              {summary ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    summary.status === "active" && !isCardFrozen
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : summary.status === "draft"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isCardFrozen
                    ? "frozen"
                    : summary.status}
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {summary
                ? `${summary.contractor} — ${summary.project}`
                : "Turn a contractor quote into an Airwallex virtual card enforced by its clauses"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {runtime ? (
            <span
              className="hidden rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground lg:inline-flex"
              title={`Airwallex: ${runtime.airwallexBaseUrl} · Parser: ${runtime.model}`}
            >
              Airwallex: <strong className="ms-1 font-medium text-foreground">{runtime.airwallexMode}</strong>
              <span className="mx-1.5 text-border">|</span>
              {runtime.model.includes("offline") ? "offline fixtures" : runtime.model}
            </span>
          ) : null}

          {jobs.length > 1 ? (
            <select
              aria-label="Select contract job"
              value={activeJobId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("job", nextId);
                    return next;
                  },
                  { replace: true },
                );
              }}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.contractRef} ({j.status}) · {j.id}
                </option>
              ))}
            </select>
          ) : null}

          {summary ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuotePanelOpen((v) => !v)}
            >
              <IconPlus className="size-3.5" />
              New quote
            </Button>
          ) : null}

          <Button
            id="resetDemo"
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleResetDemo()}
          >
            <IconRefresh className="size-3.5" />
            Reset demo
          </Button>

          <div className="hidden md:block">
            <AgentToggleButton />
          </div>
        </div>
      </header>

      {/* Immediate pending & cancellation bar / status / error feedback */}
      {busyLabel ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/60 px-3.5 py-2 text-xs font-medium text-foreground"
        >
          <span className="flex items-center gap-2">
            <IconLoader2 className="size-3.5 animate-spin" />
            {busyLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={cancelActiveOp}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {errorBanner ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-foreground"
        >
          <span className="flex items-start gap-2">
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{errorBanner}</span>
          </span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setErrorBanner(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
      ) : statusNote ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2 text-xs text-muted-foreground"
        >
          <span className="text-foreground">{statusNote}</span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setStatusNote(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
      ) : null}

      {/* Summary metrics strip when a job is open */}
      {summary ? (
        <section
          aria-label="Contract card summary"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          <div className="rounded-lg border border-border bg-card px-3.5 py-3">
            <div className="text-xs text-muted-foreground">Contract total</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {formatMoney(summary.total, summary.currency)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3.5 py-3">
            <div className="text-xs text-muted-foreground">Released limit</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatMoney(summary.released, summary.currency)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3.5 py-3">
            <div className="text-xs text-muted-foreground">Card spent</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {formatMoney(summary.spent, summary.currency)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3.5 py-3">
            <div className="text-xs text-muted-foreground">Available now</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {formatMoney(summary.available, summary.currency)}
            </div>
          </div>
          <div className="col-span-2 rounded-lg border border-border bg-card px-3.5 py-3 sm:col-span-1">
            <div className="text-xs text-muted-foreground">Card deadline</div>
            <div className="mt-1 text-base font-semibold tabular-nums">
              {summary.deadline}
            </div>
          </div>
        </section>
      ) : null}

      {/* Step 1: Quote intake (always mounted so #parse stays stable; collapses neatly after parse) */}
      <Card className={cn(!summary && "ring-1 ring-primary/25")}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 py-3.5">
          <div className="flex items-center gap-2">
            <IconFileText className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              1. Contractor Quote
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {!quotePanelOpen ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setQuotePanelOpen(true)}
              >
                Show quote text
              </Button>
            ) : summary ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setQuotePanelOpen(false)}
              >
                Collapse
              </Button>
            ) : null}
            <Button
              id="parse"
              type="button"
              size="sm"
              variant={!summary ? "default" : "secondary"}
              disabled={Boolean(busyLabel)}
              onClick={() => void handleParseQuote()}
            >
              Read quote
            </Button>
          </div>
        </CardHeader>
        {quotePanelOpen ? (
          <CardContent className="space-y-3 pt-0">
            <Label htmlFor="quoteTextarea" className="sr-only">
              Contractor quote text
            </Label>
            <textarea
              id="quoteTextarea"
              rows={summary ? 7 : 12}
              value={quoteText}
              onChange={(e) => setQuoteText(e.target.value)}
              placeholder="Paste contractor quote or service agreement…"
              className="w-full rounded-md border border-input bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Bundled sample: Maple Street Café kitchen refit (Q-2026-0412)
              </span>
              {quoteText !== SAMPLE_QUOTE_TEXT ? (
                <button
                  type="button"
                  onClick={() => setQuoteText(SAMPLE_QUOTE_TEXT)}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Restore sample quote
                </button>
              ) : null}
            </div>
          </CardContent>
        ) : null}
      </Card>

      {/* Main two-column workspace */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Left column: Extracted Terms + Approve Terms + Derived Card Rules */}
        <div className="space-y-5 lg:col-span-6">
          <Card className={cn(isDraft && "ring-1 ring-amber-500/50")}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 py-3.5">
              <CardTitle className="text-sm font-semibold">
                2. Extracted Terms & Card Issuance
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {isActive ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={Boolean(busyLabel)}
                      onClick={() => void handleToggleFreeze()}
                    >
                      {isCardFrozen ? (
                        <>
                          <IconPlayerPlay className="size-3.5" />
                          Unfreeze
                        </>
                      ) : (
                        <>
                          <IconPlayerPause className="size-3.5" />
                          Freeze card
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={Boolean(busyLabel)}
                      onClick={() => void handleCloseJob()}
                    >
                      <IconLock className="size-3.5" />
                      Close job
                    </Button>
                  </>
                ) : null}
                <Button
                  id="approveTerms"
                  type="button"
                  size="sm"
                  variant={isDraft ? "default" : "outline"}
                  disabled={!isDraft || Boolean(busyLabel)}
                  onClick={() => void handleApproveTerms()}
                >
                  <IconCreditCard className="size-3.5" />
                  {isActive || summary?.status === "closed"
                    ? "Card issued"
                    : "Approve terms & issue card"}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              {!job ? (
                <p className="text-xs text-muted-foreground">
                  Click <strong>Read quote</strong> above to extract milestones,
                  spending rules, and verbatim contract clauses.
                </p>
              ) : (
                <>
                  {job.problems.length > 0 ||
                  job.terms.open_questions.length > 0 ? (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                      <div className="font-semibold text-amber-800 dark:text-amber-200">
                        Validation issues blocking card issuance
                      </div>
                      <ul className="mt-1 list-disc space-y-0.5 ps-4 text-muted-foreground">
                        {[...job.problems, ...job.terms.open_questions].map(
                          (p, idx) => (
                            <li key={idx}>{p}</li>
                          ),
                        )}
                      </ul>
                    </div>
                  ) : null}

                  <div className="space-y-2.5">
                    {job.terms.milestones.map((m) => {
                      const released = job.releasedMilestoneIds.includes(m.id);
                      const isNext = summary?.nextMilestone?.id === m.id;
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "rounded-lg border p-3 text-xs",
                            released
                              ? "border-emerald-500/30 bg-emerald-500/5"
                              : isNext
                                ? "border-border bg-muted/30"
                                : "border-border bg-card",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-foreground">
                              <span className="me-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                {m.clause.clause_id}
                              </span>
                              {m.id}: {m.name}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold tabular-nums">
                                {formatMoney(m.amount, job.terms.currency)}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  released
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                    : m.released_on_signing
                                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                      : "bg-muted text-muted-foreground",
                                )}
                              >
                                {released
                                  ? "Released"
                                  : m.released_on_signing
                                    ? "On signing"
                                    : "Locked"}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1.5 italic text-muted-foreground">
                            “{m.clause.quote}”
                          </p>
                          {m.evidence_required.length > 0 ? (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-muted-foreground">
                                Proof required:
                              </span>
                              {m.evidence_required.map((ev) => (
                                <span
                                  key={ev}
                                  className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]"
                                >
                                  {ev}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <Separator />

                  <div className="space-y-2 text-xs">
                    <div className="rounded-md border border-border p-2.5">
                      <div className="font-medium text-foreground">
                        <span className="me-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {job.terms.allowed_spend.clause.clause_id}
                        </span>
                        Allowed categories:{" "}
                        <span className="font-normal text-muted-foreground">
                          {job.terms.allowed_spend.categories.join(", ")}
                        </span>
                      </div>
                      <p className="mt-1 italic text-muted-foreground">
                        “{job.terms.allowed_spend.clause.quote}”
                      </p>
                    </div>

                    {job.terms.prohibited_spend ? (
                      <div className="rounded-md border border-border p-2.5">
                        <div className="font-medium text-foreground">
                          <span className="me-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                            {job.terms.prohibited_spend.clause.clause_id}
                          </span>
                          Prohibited spend
                        </div>
                        <p className="mt-1 italic text-muted-foreground">
                          “{job.terms.prohibited_spend.clause.quote}”
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-md border border-border p-2.5">
                      <div className="font-medium text-foreground">
                        <span className="me-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {job.terms.deadline.clause.clause_id}
                        </span>
                        Deadline: {job.terms.deadline.date}
                      </div>
                      <p className="mt-1 italic text-muted-foreground">
                        “{job.terms.deadline.clause.quote}”
                      </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Derived Airwallex Card Controls */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 py-3.5">
              <CardTitle className="text-sm font-semibold">
                Derived Airwallex Card Controls
              </CardTitle>
              {summary?.cardId ? (
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {summary.cardId}
                </span>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-2.5 pt-0 text-xs">
              {!job || job.rules.length === 0 ? (
                <p className="text-muted-foreground">
                  Deterministic card controls (`ALL_TIME` limit, MCC allowlist,
                  `active_to` cutoff) appear here as soon as the owner approves
                  the extracted terms.
                </p>
              ) : (
                job.rules.map((r) => (
                  <div
                    key={r.control}
                    className="flex flex-col gap-1 rounded-md border border-border bg-muted/20 p-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {r.description}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {r.clause.clause_id} → {r.declines.join(", ")}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {r.value}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Swipes, Proof & Release, Change Order, Event Log */}
        <div className="space-y-5 lg:col-span-6">
          {/* Step 3: Simulate Contractor Card Charges */}
          <Card>
            <CardHeader className="py-3.5">
              <CardTitle className="text-sm font-semibold">
                3. Simulate Contractor Card Swipes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-0">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PRESET_CHARGES.map((preset) => (
                  <Button
                    key={preset.key}
                    data-charge={preset.key}
                    type="button"
                    variant="outline"
                    disabled={!isActive || Boolean(busyLabel)}
                    onClick={() => void handleSimulateCharge(preset.key)}
                    className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-start"
                  >
                    <span className="text-xs font-semibold text-foreground">
                      {preset.label}
                    </span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {preset.sublabel}
                    </span>
                  </Button>
                ))}
              </div>

              {latestTxn ? (
                <div
                  className={cn(
                    "rounded-lg border p-3 text-xs",
                    latestTxn.explanation
                      ? "border-rose-500/40 bg-rose-500/10"
                      : "border-emerald-500/40 bg-emerald-500/10",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold text-foreground">
                      {latestTxn.explanation ? (
                        <>
                          <IconX className="size-3.5 text-rose-600 dark:text-rose-400" />
                          {latestTxn.explanation.failure_reason}
                        </>
                      ) : (
                        <>
                          <IconCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                          APPROVED · {latestTxn.merchant_name}
                        </>
                      )}
                    </span>
                    {latestTxn.explanation?.clause_id ? (
                      <span className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                        {latestTxn.explanation.clause_id}
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] tabular-nums">
                        {formatMoney(latestTxn.amount, latestTxn.currency)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-foreground">
                    {latestTxn.explanation
                      ? latestTxn.explanation.headline
                      : `Cleared ${formatMoney(latestTxn.amount, latestTxn.currency)} at ${latestTxn.merchant_name} (MCC ${latestTxn.merchant_category_code}).`}
                  </p>
                  {latestTxn.explanation?.clause_quote ? (
                    <p className="mt-1 italic text-muted-foreground">
                      “{latestTxn.explanation.clause_quote}”
                    </p>
                  ) : null}
                  {latestTxn.explanation ? (
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() =>
                          askClauseAboutDecline(
                            latestTxn.transaction_id,
                            latestTxn.explanation!.headline,
                          )
                        }
                      >
                        <IconMessageChatbot className="size-3.5" />
                        Ask Clause in chat
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {job && job.transactions.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    Card ledger ({job.transactions.length})
                  </div>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto pe-1">
                    {[...job.transactions].reverse().map((t) => (
                      <div
                        key={t.transaction_id}
                        className="flex items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {t.merchant_name}{" "}
                            <span className="font-normal text-muted-foreground">
                              (MCC {t.merchant_category_code})
                            </span>
                          </div>
                          {t.explanation ? (
                            <div className="truncate text-[11px] text-rose-600 dark:text-rose-400">
                              {t.explanation.failure_reason}
                              {t.explanation.clause_id
                                ? ` · ${t.explanation.clause_id}`
                                : ""}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-end">
                          <div className="font-mono text-xs font-semibold tabular-nums">
                            {formatMoney(t.amount, t.currency)}
                          </div>
                          <div
                            className={cn(
                              "text-[10px] font-medium",
                              t.explanation
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-emerald-600 dark:text-emerald-400",
                            )}
                          >
                            {t.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Step 4: Milestone Proof & Bound Release Approval */}
          <Card
            className={cn(
              pendingRelease && "ring-1 ring-amber-500/60",
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 py-3.5">
              <CardTitle className="text-sm font-semibold">
                4. Milestone Proof & Release
              </CardTitle>
              {summary?.nextMilestone ? (
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
                  Next: {summary.nextMilestone.id} (+
                  {formatMoney(summary.nextMilestone.amount, summary.currency)})
                </span>
              ) : null}
            </CardHeader>

            <CardContent className="space-y-3.5 pt-0 text-xs">
              {summary?.nextMilestone ? (
                <div className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">
                  <strong className="text-foreground">
                    {summary.nextMilestone.clauseId} ·{" "}
                    {summary.nextMilestone.name}
                  </strong>{" "}
                  requires:{" "}
                  <span className="font-mono text-foreground">
                    {summary.nextMilestone.evidenceRequired.join(" + ") ||
                      "none"}
                  </span>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="proofKind" className="text-xs">
                    Evidence kind
                  </Label>
                  <select
                    id="proofKind"
                    value={proofKind}
                    onChange={(e) =>
                      setProofKind(e.target.value as DeclaredProofKind)
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {PROOF_KIND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="proofFiles" className="text-xs">
                    Proof file(s)
                  </Label>
                  <input
                    ref={proofInputRef}
                    id="proofFiles"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,application/pdf"
                    className="block h-9 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground file:me-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-0.5 file:text-xs file:font-medium"
                  />
                </div>
              </div>

              {stagedProofFiles.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {stagedProofFiles.map((f, idx) => (
                    <span
                      key={`${f.filename}-${idx}`}
                      className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-2 py-0.5 text-[11px]"
                    >
                      {f.declaredKind}: {f.filename}
                      <button
                        type="button"
                        aria-label={`Remove ${f.filename}`}
                        onClick={() =>
                          setStagedProofFiles((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                      >
                        <IconX className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    id="submitProof"
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      !isActive ||
                      !summary?.nextMilestone ||
                      Boolean(busyLabel)
                    }
                    onClick={() => void handleSubmitProof()}
                  >
                    <IconUpload className="size-3.5" />
                    Submit proof
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!isActive || Boolean(busyLabel)}
                    onClick={() => void handleStageSelectedFiles()}
                  >
                    Stage file
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  {pendingRelease ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={Boolean(busyLabel)}
                      onClick={() => void handleRejectPending()}
                    >
                      Reject
                    </Button>
                  ) : null}
                  <Button
                    id="approveRelease"
                    type="button"
                    size="sm"
                    variant={
                      pendingRelease &&
                      pendingRelease.verdict?.verdict !== "insufficient"
                        ? "default"
                        : "outline"
                    }
                    disabled={
                      !pendingRelease ||
                      pendingRelease.verdict?.verdict === "insufficient" ||
                      Boolean(busyLabel)
                    }
                    onClick={() => void handleApproveRelease()}
                  >
                    Approve release
                  </Button>
                </div>
              </div>

              {pendingRelease ? (
                <div
                  className={cn(
                    "rounded-lg border p-3",
                    pendingRelease.verdict?.verdict === "insufficient"
                      ? "border-rose-500/40 bg-rose-500/10"
                      : "border-amber-500/40 bg-amber-500/10",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      Pending {pendingRelease.milestone_id} release ·{" "}
                      {formatMoney(
                        pendingRelease.amount ?? 0,
                        pendingRelease.currency,
                      )}
                    </span>
                    <span className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[11px] uppercase">
                      Verdict: {pendingRelease.verdict?.verdict ?? "pending"}
                    </span>
                  </div>
                  {pendingRelease.verdict?.reasoning ? (
                    <p className="mt-1 text-foreground">
                      {pendingRelease.verdict.reasoning}
                    </p>
                  ) : null}
                  <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                    Bound approval: {pendingRelease.approval_id}
                    {pendingRelease.evidence_sha256
                      ? ` · sha256:${pendingRelease.evidence_sha256.slice(0, 12)}…`
                      : ""}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Step 5: Contractor Change Order */}
          <Card className={cn(pendingCo && "ring-1 ring-amber-500/60")}>
            <CardHeader className="py-3.5">
              <CardTitle className="text-sm font-semibold">
                5. Contractor Change Order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-xs">
              <Label htmlFor="coEmailTextarea" className="sr-only">
                Contractor change-order email
              </Label>
              <textarea
                id="coEmailTextarea"
                rows={5}
                value={coEmailText}
                onChange={(e) => setCoEmailText(e.target.value)}
                placeholder="Paste contractor email requesting scope, amount, or deadline change…"
                className="w-full rounded-md border border-input bg-muted/30 p-2.5 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  id="draftCo"
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!isActive || Boolean(busyLabel)}
                  onClick={() => void handleDraftChangeOrder()}
                >
                  Draft change order
                </Button>

                <div className="flex items-center gap-2">
                  {pendingCo ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={Boolean(busyLabel)}
                      onClick={() => void handleRejectPending()}
                    >
                      Reject
                    </Button>
                  ) : null}
                  <Button
                    id="approveCo"
                    type="button"
                    size="sm"
                    variant={pendingCo ? "default" : "outline"}
                    disabled={!pendingCo || Boolean(busyLabel)}
                    onClick={() => void handleApproveChangeOrder()}
                  >
                    Approve change order
                  </Button>
                </div>
              </div>

              {pendingCo?.change_order ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-foreground">
                    <span>Proposed change order</span>
                    <span className="font-mono text-[11px]">
                      {pendingCo.approval_id}
                    </span>
                  </div>
                  <p className="mt-1 text-foreground">
                    {pendingCo.change_order.summary}
                  </p>
                  {pendingCo.change_order.milestone_amount_changes.map((ch) => (
                    <div
                      key={ch.milestone_id}
                      className="mt-1 font-mono text-[11px] text-foreground"
                    >
                      {ch.milestone_id} →{" "}
                      {formatMoney(ch.new_amount, pendingCo.currency)} (
                      {ch.reason})
                    </div>
                  ))}
                  {pendingCo.change_order.new_deadline ? (
                    <div className="mt-1 font-mono text-[11px] text-foreground">
                      New deadline: {pendingCo.change_order.new_deadline}
                    </div>
                  ) : null}
                  <p className="mt-1.5 italic text-muted-foreground">
                    “{pendingCo.change_order.source_quote}”
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Audit Event Log */}
          {job && job.events.length > 0 ? (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-semibold">
                  Audit Trail ({job.events.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="max-h-48 space-y-1.5 overflow-y-auto pe-1 text-xs">
                  {[...job.events].reverse().map((ev, idx) => (
                    <div
                      key={`${ev.at}-${idx}`}
                      className="flex items-start justify-between gap-2 border-b border-border/60 pb-1.5 last:border-b-0"
                    >
                      <span className="text-foreground">{ev.detail}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {ev.type}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
