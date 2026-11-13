import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { AgentToggleButton } from "@agent-native/toolkit/app/chat";
import {
  IconCheck,
  IconChevronDown,
  IconFlask,
  IconHistory,
  IconLock,
  IconMessageChatbot,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ALL_PRESET_CHARGES,
  type ChargePresetKey,
  type DeclaredProofKind,
  SAMPLE_CHANGE_ORDER_EMAIL_TEXT,
  SAMPLE_EXCEPTION_NOTE_TEXT,
  SAMPLE_QUOTE_TEXT,
} from "@/lib/clause-samples";
import { cn } from "@/lib/utils";

import { ActionBar } from "./ActionBar";
import { ActivitySheet } from "./ActivitySheet";
import { ConnectorOverlay } from "./ConnectorOverlay";
import { ContractDocument } from "./ContractDocument";
import { EnforcementPanel } from "./EnforcementPanel";
import { MilestoneBar } from "./MilestoneBar";
import { EmptyJobState, NewJobDialog } from "./NewJobDialog";
import { SandboxToolsDrawer } from "./SandboxToolsDrawer";
import { ContractorPhone } from "./ContractorPhone";
import {
  formatCurrency,
  formatWorkspaceJobTitle,
  saveRawQuoteForJob,
  stripLegalSuffix,
} from "./clause-format";
import type {
  ClauseJob,
  JobSummary,
  RuntimeInfo,
  UploadableProofFile,
} from "./clause-types";

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

function ClauseDocumentLogo() {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-6 w-5 shrink-0 items-center justify-center rounded-[4px] bg-[#0F7B55] shadow-2xs"
    >
      <span className="absolute right-0 top-0 size-1.5 rounded-bl-[3px] bg-[#FAF8F3]/85" />
      <span className="mt-1 flex flex-col gap-0.5">
        <span className="h-[1.5px] w-2.5 rounded-full bg-white/90" />
        <span className="h-[1.5px] w-2 rounded-full bg-white/70" />
      </span>
    </span>
  );
}

function WorkspaceLoadingSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1360px] grid-cols-1 gap-8 px-4 py-7 sm:px-7 lg:grid-cols-12 lg:gap-10">
      <div className="space-y-4 lg:col-span-7">
        <Skeleton className="h-4 w-3/4 bg-stone-200/80" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-14 rounded-lg bg-stone-200/70" />
          <Skeleton className="h-14 rounded-lg bg-stone-200/70" />
          <Skeleton className="h-14 rounded-lg bg-stone-200/70" />
        </div>
        <div className="clause-paper-sheet space-y-4 rounded-[10px] p-8">
          <Skeleton className="h-7 w-2/3 bg-stone-200/70" />
          <Skeleton className="h-4 w-1/2 bg-stone-200/60" />
          <div className="space-y-3 pt-4">
            <Skeleton className="h-16 w-full bg-stone-200/55" />
            <Skeleton className="h-16 w-full bg-stone-200/55" />
            <Skeleton className="h-16 w-full bg-stone-200/55" />
            <Skeleton className="h-14 w-5/6 bg-stone-200/55" />
          </div>
        </div>
      </div>
      <div className="space-y-4 lg:col-span-5">
        <Skeleton className="h-6 w-36 bg-stone-200/75" />
        <Skeleton className="h-32 w-full rounded-xl bg-stone-200/70" />
        <Skeleton className="h-44 w-full rounded-xl bg-stone-200/60" />
      </div>
    </div>
  );
}

export function ClauseJobWorkspace() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlJobId = searchParams.get("job")?.trim() || "";

  const listQuery = useActionQuery("list-jobs", {});
  const jobs = (listQuery.data?.jobs ?? []) as JobSummary[];
  const runtime = listQuery.data?.runtime as RuntimeInfo | undefined;

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
    (jobQuery.data?.summary as JobSummary | undefined) ??
    jobs.find((j) => j.id === activeJobId) ??
    null;
  const job = (jobQuery.data?.job as ClauseJob | undefined) ?? null;

  // Clause actions
  const parseQuoteMut = useActionMutation("parse-quote");
  const approveTermsMut = useActionMutation("approve-terms");
  const simulateChargeMut = useActionMutation("simulate-charge");
  const submitProofMut = useActionMutation("submit-proof");
  const approveReleaseMut = useActionMutation("approve-release");
  const rejectPendingMut = useActionMutation("reject-pending");
  const draftCoMut = useActionMutation("draft-change-order");
  const approveCoMut = useActionMutation("approve-change-order");
  const requestExceptionMut = useActionMutation("request-exception");
  const approveExceptionMut = useActionMutation("approve-exception");
  const freezeCardMut = useActionMutation("freeze-card");
  const closeJobMut = useActionMutation("close-job");
  const resetDemoMut = useActionMutation("reset-demo");

  // UI sheets / dialogs / clause highlight state
  const [quoteText, setQuoteText] = useState("");
  const [coEmailText, setCoEmailText] = useState(SAMPLE_CHANGE_ORDER_EMAIL_TEXT);
  const [exceptionNote, setExceptionNote] = useState(SAMPLE_EXCEPTION_NOTE_TEXT);
  const [proofKind, setProofKind] = useState<DeclaredProofKind>("photos");
  const [stagedProofFiles, setStagedProofFiles] = useState<
    UploadableProofFile[]
  >([]);

  const [newJobOpen, setNewJobOpen] = useState(false);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [proofSheetOpen, setProofSheetOpen] = useState(false);
  const [coSheetOpen, setCoSheetOpen] = useState(false);

  const [hoveredClauseId, setHoveredClauseId] = useState<string | null>(null);
  const [pinnedClauseId, setPinnedClauseId] = useState<string | null>(null);
  const activeClauseId = hoveredClauseId ?? pinnedClauseId;

  const proofInputRef = useRef<HTMLInputElement>(null);
  const workspaceGridRef = useRef<HTMLDivElement>(null);

  // Keep proofKind defaulted to nextMilestone's required kind
  const nextReqKind = summary?.nextMilestone?.evidenceRequired?.[0] as
    | DeclaredProofKind
    | undefined;
  useEffect(() => {
    if (nextReqKind) {
      setProofKind(nextReqKind);
    }
  }, [nextReqKind]);

  // Clear pinned clause when switching jobs
  useEffect(() => {
    setPinnedClauseId(null);
    setHoveredClauseId(null);
  }, [activeJobId]);

  // Immediate (<100ms) single-slot operation guard with overlap rejection & cancellation
  const activeOpRef = useRef<{ id: number; label: string } | null>(null);
  const nextOpIdRef = useRef(0);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  function cancelActiveOp() {
    if (!activeOpRef.current) return;
    activeOpRef.current = null;
    setBusyLabel(null);
    toast.message("Operation cancelled.");
  }

  async function runExclusive<T>(
    label: string,
    work: () => Promise<T>,
    onDone?: (result: T) => void,
  ): Promise<void> {
    if (activeOpRef.current) {
      toast.info(`"${activeOpRef.current.label}" is still running.`);
      return;
    }
    const id = ++nextOpIdRef.current;
    activeOpRef.current = { id, label };
    setBusyLabel(label);

    try {
      const result = await work();
      if (activeOpRef.current?.id !== id) return;
      onDone?.(result);
    } catch (err) {
      if (activeOpRef.current?.id !== id) return;
      const msg =
        actionErrorMessage(err) ??
        (err instanceof Error ? err.message : "Operation failed.");
      toast.error(msg);
    } finally {
      if (activeOpRef.current?.id === id) {
        activeOpRef.current = null;
        setBusyLabel(null);
      }
    }
  }

  const isCardFrozen = (() => {
    if (!job?.events?.length) return false;
    for (let i = job.events.length - 1; i >= 0; i--) {
      const ev = job.events[i];
      if (ev?.type === "card_frozen") {
        return (
          ev.detail.toLowerCase().includes("frozen by owner") &&
          !ev.detail.toLowerCase().includes("unfrozen")
        );
      }
    }
    return false;
  })();

  const pending = job?.pending ?? summary?.pending ?? null;
  const pendingRelease =
    pending?.kind === "release_milestone" ? pending : null;
  const pendingCo = pending?.kind === "change_order" ? pending : null;
  const pendingException =
    pending?.kind === "policy_exception" ? pending : null;

  function handleSelectClause(clauseId: string) {
    setPinnedClauseId((prev) => (prev === clauseId ? null : clauseId));
    const root = workspaceGridRef.current;
    if (!root) return;
    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(clauseId)
        : clauseId.replace(/"/g, '\\"');
    const el = root.querySelector<HTMLElement>(
      `[data-clause-anchor="${escaped}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function handleParseQuote() {
    const trimmed = quoteText.trim();
    const usedText = trimmed || SAMPLE_QUOTE_TEXT;
    await runExclusive(
      "Reading document…",
      () =>
        parseQuoteMut.mutateAsync(
          trimmed ? { text: trimmed } : { useSample: true },
        ),
      (res) => {
        saveRawQuoteForJob(res.summary.id, usedText);
        setNewJobOpen(false);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("job", res.summary.id);
            return next;
          },
          { replace: true },
        );
        toast.success(
          res.kind === "policy"
            ? `Extracted policy controls & ${formatCurrency(res.summary.total, res.summary.currency)} budget from ${res.summary.contractRef}.`
            : `Extracted ${res.terms.milestones.length} milestones from ${res.summary.contractRef}.`,
        );
        if (!trimmed) {
          setQuoteText(SAMPLE_QUOTE_TEXT);
        }
      },
    );
  }

  async function handleApproveTerms() {
    if (!activeJobId) return;
    await runExclusive(
      "Issuing virtual card…",
      () => approveTermsMut.mutateAsync({ jobId: activeJobId }),
      (res) => {
        toast.success(
          res.summary.kind === "policy"
            ? `Trip card issued with ${formatCurrency(res.summary.released, res.summary.currency)} budget and ${formatCurrency(res.summary.perChargeCap ?? 300, res.summary.currency)} per-charge cap.`
            : `Virtual card issued with ${formatCurrency(res.summary.released, res.summary.currency)} limit.`,
        );
      },
    );
  }

  async function handleRunPresetCharge(preset: ChargePresetKey) {
    if (!activeJobId) return;
    const presetMeta = ALL_PRESET_CHARGES.find((p) => p.key === preset);
    await runExclusive(
      `Authorizing ${presetMeta?.label ?? preset}…`,
      () =>
        simulateChargeMut.mutateAsync({
          jobId: activeJobId,
          preset,
        }),
      (res) => {
        if (res.approved) {
          toast.success(
            `Approved ${formatCurrency(res.txn.amount, res.txn.currency)} at ${res.txn.merchant_name}.`,
          );
        } else {
          toast.error(
            res.explanation?.headline ??
              `Declined at ${res.txn.merchant_name}.`,
          );
        }
      },
    );
  }

  async function handleRunCustomCharge(input: {
    merchantName: string;
    mcc: string;
    amount: number;
  }) {
    if (!activeJobId) return;
    await runExclusive(
      `Authorizing ${input.merchantName}…`,
      () =>
        simulateChargeMut.mutateAsync({
          jobId: activeJobId,
          merchantName: input.merchantName,
          mcc: input.mcc,
          amount: input.amount,
        }),
      (res) => {
        if (res.approved) {
          toast.success(
            `Approved ${formatCurrency(res.txn.amount, res.txn.currency)} at ${res.txn.merchant_name}.`,
          );
        } else {
          toast.error(
            res.explanation?.headline ??
              `Declined at ${res.txn.merchant_name}.`,
          );
        }
      },
    );
  }

  /** No file attached: use the bundled sample site photo, never a placeholder byte. */
  async function loadSampleProof(kind: typeof proofKind): Promise<UploadableProofFile> {
    if (kind !== "photos") {
      throw new Error("Attach the inspection report (PDF) to submit this proof.");
    }
    const res = await fetch("/samples/cabinets-installed.jpg");
    if (!res.ok) throw new Error("Could not load the sample site photo.");
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return {
      filename: "cabinets-installed.jpg",
      mediaType: "image/jpeg",
      base64: btoa(bin),
      declaredKind: kind,
    };
  }

  async function collectInputFiles(): Promise<UploadableProofFile[]> {
    const rawList = proofInputRef.current?.files;
    if (!rawList || rawList.length === 0) return [];
    const converted: UploadableProofFile[] = [];
    for (const file of Array.from(rawList)) {
      const base64 = await readFileAsBase64(file);
      if (!base64) throw new Error(`${file.name} is empty or unreadable.`);
      converted.push({
        filename: file.name,
        mediaType: inferMediaType(file),
        base64,
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
      toast.error(err instanceof Error ? err.message : "Could not read file");
    }
  }

  async function handleSubmitProof() {
    if (!activeJobId) return;
    await runExclusive(
      "Evaluating milestone proof…",
      async () => {
        const fromInput = await collectInputFiles();
        const combined = [...stagedProofFiles, ...fromInput];
        const filesToSend: UploadableProofFile[] =
          combined.length > 0 ? combined : [await loadSampleProof(proofKind)];
        return submitProofMut.mutateAsync({
          jobId: activeJobId,
          files: filesToSend,
        });
      },
      (res) => {
        setStagedProofFiles([]);
        if (proofInputRef.current) proofInputRef.current.value = "";
        const verdict = res.pending?.verdict?.verdict;
        if (verdict === "insufficient") {
          toast.error("Proof did not meet contract requirements.");
        } else {
          toast.success("Milestone proof verified and ready for approval.");
        }
      },
    );
  }

  async function handleApproveRelease() {
    if (
      !activeJobId ||
      !pendingRelease ||
      !pendingRelease.milestone_id ||
      pendingRelease.amount === undefined
    ) {
      return;
    }
    const milestoneId = pendingRelease.milestone_id;
    const amount = pendingRelease.amount;
    await runExclusive(
      `Releasing ${milestoneId}…`,
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
        toast.success(
          `Released ${milestoneId}. Card limit raised to ${formatCurrency(res.summary.released, res.summary.currency)}.`,
        );
      },
    );
  }

  async function handleDraftChangeOrder() {
    if (!activeJobId) return;
    const trimmed = coEmailText.trim();
    await runExclusive(
      "Reading change-order message…",
      () =>
        draftCoMut.mutateAsync(
          trimmed
            ? { jobId: activeJobId, emailText: trimmed }
            : { jobId: activeJobId, useSample: true },
        ),
      () => {
        toast.success("Change order drafted. Review diff before approving.");
      },
    );
  }

  async function handleApproveChangeOrder() {
    if (!activeJobId || !pendingCo) return;
    await runExclusive(
      "Updating contract & card controls…",
      () =>
        approveCoMut.mutateAsync({
          jobId: activeJobId,
          approvalId: pendingCo.approval_id,
        }),
      (res) => {
        toast.success(
          `Change order approved. Total is now ${formatCurrency(res.summary.total, res.summary.currency)}.`,
        );
      },
    );
  }

  async function handleRequestException() {
    if (!activeJobId) return;
    const trimmed = exceptionNote.trim();
    await runExclusive(
      "Evaluating §3.4 exception…",
      () =>
        requestExceptionMut.mutateAsync(
          trimmed
            ? { jobId: activeJobId, note: trimmed }
            : { jobId: activeJobId, useSample: true },
        ),
      (res) => {
        const cap = res.proposal?.one_time_cap;
        toast.success(
          cap
            ? `Exception proposed up to ${formatCurrency(cap, res.summary.currency)} (${res.proposal?.clause.clause_id ?? "§3.4"}). Waiting for manager approval.`
            : "Exception request staged for manager approval.",
        );
      },
    );
  }

  async function handleApproveException() {
    if (!activeJobId || !pendingException) return;
    await runExclusive(
      "Updating per-charge card limit…",
      () =>
        approveExceptionMut.mutateAsync({
          jobId: activeJobId,
          approvalId: pendingException.approval_id,
        }),
      (res) => {
        const cap =
          res.activeException?.one_time_cap ?? res.summary.perChargeCap ?? 500;
        toast.success(
          `Exception approved. Next charge allowed up to ${formatCurrency(cap, res.summary.currency)}.`,
        );
      },
    );
  }

  async function handleRejectPending() {
    if (!activeJobId || !pending) return;
    await runExclusive(
      "Dismissing pending request…",
      () =>
        rejectPendingMut.mutateAsync({
          jobId: activeJobId,
          reason: "Declined by owner",
        }),
      () => {
        setProofSheetOpen(false);
        setCoSheetOpen(false);
        toast.message("Pending request rejected; card controls unchanged.");
      },
    );
  }

  async function handleToggleFreeze() {
    if (!activeJobId) return;
    const nextFrozen = !isCardFrozen;
    await runExclusive(
      nextFrozen ? "Freezing card…" : "Activating card…",
      () =>
        freezeCardMut.mutateAsync({
          jobId: activeJobId,
          frozen: nextFrozen,
        }),
      () => {
        toast.success(nextFrozen ? "Card frozen." : "Card active.");
      },
    );
  }

  async function handleCloseJob() {
    if (!activeJobId) return;
    await runExclusive(
      "Closing contract card…",
      () => closeJobMut.mutateAsync({ jobId: activeJobId }),
      () => {
        toast.success("Contract job and virtual card closed.");
      },
    );
  }

  async function handleResetWorkspace() {
    await runExclusive(
      "Resetting workspace…",
      () => resetDemoMut.mutateAsync({}),
      () => {
        setStagedProofFiles([]);
        setQuoteText("");
        setCoEmailText(SAMPLE_CHANGE_ORDER_EMAIL_TEXT);
        setExceptionNote(SAMPLE_EXCEPTION_NOTE_TEXT);
        setSandboxOpen(false);
        setProofSheetOpen(false);
        setCoSheetOpen(false);
        setActivityOpen(false);
        setSearchParams(new URLSearchParams(), { replace: true });
        toast.success("Workspace cleared.");
      },
    );
  }

  function askClauseAboutDecline(txnId: string, headline: string) {
    if (!activeJobId) return;
    const clauseNoun =
      job?.kind === "policy" ? "policy clause" : "contract clause";
    sendToAgentChat({
      message: `Explain why this card charge was declined and cite the ${clauseNoun}: "${headline}"`,
      context: JSON.stringify({ jobId: activeJobId, transactionId: txnId }),
      submit: true,
      openSidebar: true,
    });
  }

  const isInitialLoading =
    listQuery.isLoading || (Boolean(activeJobId) && jobQuery.isLoading && !job);

  const jobDisplayTitle = summary ? formatWorkspaceJobTitle(summary) : null;

  const statusPill = (() => {
    if (!summary) return null;
    if (summary.status === "closed") {
      return {
        label: "Closed",
        cls: "bg-stone-200/90 text-stone-600 border-stone-300/80",
      };
    }
    if (summary.status === "draft") {
      return {
        label: "Draft",
        cls: "bg-amber-500/12 text-amber-800 border-amber-500/25",
      };
    }
    if (isCardFrozen) {
      return {
        label: "Frozen",
        cls: "bg-amber-500/12 text-amber-800 border-amber-500/25",
      };
    }
    return {
      label: "Active",
      cls: "bg-[#0F7B55]/12 text-[#0F7B55] border-[#0F7B55]/25",
    };
  })();

  const ownerInitials = summary
    ? stripLegalSuffix(summary.client)
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("") || "CL"
    : "CL";

  const connectorDepKey = job
    ? `${job.id}:${job.status}:${job.transactions.length}:${job.terms.deadline.date}:${job.releasedMilestoneIds.join(",")}:${job.pending?.approval_id ?? ""}:${job.activeException?.approval_id ?? ""}`
    : "empty";

  return (
    <div className="clause-workspace-surface flex min-h-full w-full flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 border-b border-[#E5DFD2] bg-[#FAF8F3]/95 backdrop-blur-xs">
        <div className="mx-auto flex min-h-14 w-full max-w-[1360px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-7">
          {/* Left: Clause logo + Job identity */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <ClauseDocumentLogo />
              <span className="text-sm font-semibold tracking-tight text-stone-900">
                Clause
              </span>
            </div>

            {summary && jobDisplayTitle ? (
              <>
                <span
                  aria-hidden="true"
                  className="hidden h-4 w-px bg-[#DFD9CC] sm:inline-block"
                />
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {jobs.length > 1 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex max-w-[260px] items-center gap-1 truncate rounded-md px-1.5 py-1 text-sm font-medium text-stone-900 hover:bg-stone-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/40 sm:max-w-md"
                        >
                          <span className="truncate">{jobDisplayTitle}</span>
                          <IconChevronDown className="size-3.5 shrink-0 text-stone-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-72">
                        <DropdownMenuLabel className="text-xs text-stone-500">
                          Contract &amp; policy cards
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {jobs.map((j) => (
                          <DropdownMenuItem
                            key={j.id}
                            onSelect={() => {
                              setSearchParams(
                                (prev) => {
                                  const next = new URLSearchParams(prev);
                                  next.set("job", j.id);
                                  return next;
                                },
                                { replace: true },
                              );
                            }}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {formatWorkspaceJobTitle(j)}
                              </div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {j.contractRef} ·{" "}
                                {stripLegalSuffix(
                                  j.kind === "policy" ? j.client : j.contractor,
                                )}
                              </div>
                            </div>
                            {j.id === activeJobId ? (
                              <IconCheck className="size-3.5 shrink-0 text-[#0F7B55]" />
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <h1 className="truncate text-sm font-medium text-stone-900">
                      {jobDisplayTitle}
                    </h1>
                  )}

                  <span className="hidden text-xs text-stone-500 md:inline">
                    ·{" "}
                    {stripLegalSuffix(
                      summary.kind === "policy"
                        ? summary.client
                        : summary.contractor,
                    )}
                  </span>

                  {statusPill ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
                        statusPill.cls,
                      )}
                    >
                      {statusPill.label}
                    </span>
                  ) : null}

                  {runtime?.airwallexMode === "sandbox" ? (
                    <span className="inline-flex items-center rounded-full border border-stone-300/80 bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-stone-600">
                      Sandbox
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          {/* Right: New job, Activity, Flask Sandbox, Agent rail, Avatar menu */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNewJobOpen(true)}
              className="h-8 border-[#DDD6C7] bg-white/85 px-2.5 text-xs font-medium text-stone-800 hover:bg-white"
            >
              <IconPlus className="size-3.5 text-stone-500" />
              <span>New job</span>
            </Button>

            {job ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setActivityOpen(true)}
                className="h-8 px-2.5 text-xs font-medium text-stone-600 hover:bg-stone-200/55 hover:text-stone-900"
              >
                <IconHistory className="size-3.5" />
                <span className="hidden sm:inline">Activity</span>
              </Button>
            ) : null}

            <Button
              data-sandbox-trigger="true"
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSandboxOpen(true)}
              className="h-8 px-2.5 text-xs font-medium text-stone-500 hover:bg-stone-200/55 hover:text-stone-900"
            >
              <IconFlask className="size-3.5" />
              <span className="hidden sm:inline">Sandbox</span>
            </Button>

            <div className="hidden md:block">
              <AgentToggleButton />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account and contract actions"
                  className="flex size-8 items-center justify-center rounded-full border border-[#DDD6C7] bg-white text-[11px] font-semibold text-stone-700 shadow-2xs transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7B55]/45"
                >
                  {summary ? (
                    ownerInitials
                  ) : (
                    <IconUser className="size-3.5 text-stone-600" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">
                  <div className="font-semibold text-foreground">
                    {summary
                      ? stripLegalSuffix(summary.client)
                      : "Clause Workspace"}
                  </div>
                  {summary ? (
                    <div className="font-normal text-muted-foreground">
                      {summary.contractRef}
                    </div>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {summary?.status === "active" ? (
                  <>
                    <DropdownMenuItem
                      onSelect={() => void handleToggleFreeze()}
                      className="text-xs"
                    >
                      {isCardFrozen ? (
                        <>
                          <IconPlayerPlay className="size-3.5" />
                          Activate virtual card
                        </>
                      ) : (
                        <>
                          <IconPlayerPause className="size-3.5" />
                          Freeze virtual card
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void handleCloseJob()}
                      className="text-xs text-rose-700 focus:text-rose-700"
                    >
                      <IconLock className="size-3.5" />
                      Close contract &amp; card
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}

                <DropdownMenuItem
                  onSelect={() => navigate("/chat")}
                  className="text-xs"
                >
                  <IconMessageChatbot className="size-3.5" />
                  Open Clause chat
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => navigate("/settings")}
                  className="text-xs"
                >
                  <IconSettings className="size-3.5" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {isInitialLoading ? (
        <WorkspaceLoadingSkeleton />
      ) : !job || !summary ? (
        <EmptyJobState
          quoteText={quoteText}
          onQuoteTextChange={setQuoteText}
          onParse={() => void handleParseQuote()}
          busy={Boolean(busyLabel)}
          dialogOpen={newJobOpen}
        />
      ) : (
        <>
          <div
            data-draft-review={summary.status === "draft" ? "true" : undefined}
            className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-7 sm:py-8"
          >
            {summary.status === "draft" ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DFD8C8] bg-white/75 px-4 py-2.5 text-xs text-stone-600">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#0F7B55]">
                    <span className="flex size-4 items-center justify-center rounded-full bg-[#0F7B55]/15 text-[#0F7B55]">
                      <IconCheck className="size-3" strokeWidth={2.5} />
                    </span>
                    {summary.kind === "policy"
                      ? "Policy & trip parsed"
                      : "Quote parsed"}
                  </span>
                  <span aria-hidden="true" className="text-stone-300">
                    /
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-stone-900">
                    <span className="flex size-4 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white">
                      2
                    </span>
                    Review highlighted clauses &amp; derived controls
                  </span>
                </div>
                <span className="text-[11px] text-stone-500">
                  Hover or select any § tag to verify the card rule it governs
                </span>
              </div>
            ) : null}

            <div
              ref={workspaceGridRef}
              className="relative grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-11"
            >
              {/* SVG Connector Overlay between clauses and transaction feed */}
              <ConnectorOverlay
                containerRef={workspaceGridRef}
                activeClauseId={activeClauseId}
                dependencyKey={connectorDepKey}
              />

              {/* Left ~60%: Milestone bar + Contract paper */}
              <div className="space-y-4 lg:col-span-7">
                <MilestoneBar
                  job={job}
                  summary={summary}
                  activeClauseId={activeClauseId}
                  onHoverClause={setHoveredClauseId}
                  onSelectClause={handleSelectClause}
                />

                <ContractDocument
                  job={job}
                  activeClauseId={activeClauseId}
                  onHoverClause={setHoveredClauseId}
                  onSelectClause={handleSelectClause}
                />
              </div>

              {/* Right ~40%: Live enforcement / Derived controls */}
              <div className="lg:sticky lg:top-20 lg:col-span-5">
                <EnforcementPanel
                  job={job}
                  summary={summary}
                  isFrozen={isCardFrozen}
                  busy={Boolean(busyLabel)}
                  activeClauseId={activeClauseId}
                  onHoverClause={setHoveredClauseId}
                  onSelectClause={handleSelectClause}
                  onToggleFreeze={() => void handleToggleFreeze()}
                  onAskClause={askClauseAboutDecline}
                  onApproveException={() => void handleApproveException()}
                  onRejectPending={() => void handleRejectPending()}
                />
              </div>
            </div>
          </div>

          <ActionBar
            job={job}
            summary={summary}
            busyLabel={busyLabel}
            onCancelBusy={cancelActiveOp}
            onApproveTerms={() => void handleApproveTerms()}
            proofSheetOpen={proofSheetOpen}
            onProofSheetOpenChange={setProofSheetOpen}
            proofKind={proofKind}
            onProofKindChange={setProofKind}
            proofInputRef={proofInputRef}
            stagedProofFiles={stagedProofFiles}
            onStageSelectedFiles={() => void handleStageSelectedFiles()}
            onRemoveStagedFile={(idx) =>
              setStagedProofFiles((prev) => prev.filter((_, i) => i !== idx))
            }
            onSubmitProof={() => void handleSubmitProof()}
            onApproveRelease={() => void handleApproveRelease()}
            coSheetOpen={coSheetOpen}
            onCoSheetOpenChange={setCoSheetOpen}
            coEmailText={coEmailText}
            onCoEmailTextChange={setCoEmailText}
            onDraftChangeOrder={() => void handleDraftChangeOrder()}
            onApproveChangeOrder={() => void handleApproveChangeOrder()}
            onRejectPending={() => void handleRejectPending()}
          />
        </>
      )}

      {/* Dialogs & Drawers */}
      <NewJobDialog
        open={newJobOpen}
        onOpenChange={setNewJobOpen}
        quoteText={quoteText}
        onQuoteTextChange={setQuoteText}
        onParse={() => void handleParseQuote()}
        busy={Boolean(busyLabel)}
      />

      <SandboxToolsDrawer
        open={sandboxOpen}
        onOpenChange={setSandboxOpen}
        kind={summary?.kind ?? "contract"}
        canCharge={summary?.status === "active"}
        busy={Boolean(busyLabel)}
        currency={summary?.currency ?? "USD"}
        runtime={runtime}
        onRunPresetCharge={(preset) => void handleRunPresetCharge(preset)}
        onRunCustomCharge={(input) => void handleRunCustomCharge(input)}
        onResetWorkspace={() => void handleResetWorkspace()}
        phoneVisible={phoneVisible}
        onPhoneVisibleChange={setPhoneVisible}
      />

      {phoneVisible ? (
        <ContractorPhone
          job={job}
          summary={summary ?? null}
          isFrozen={isCardFrozen}
          onClose={() => setPhoneVisible(false)}
          exceptionNote={exceptionNote}
          onExceptionNoteChange={setExceptionNote}
          onRequestException={() => void handleRequestException()}
          busy={Boolean(busyLabel)}
        />
      ) : null}

      <ActivitySheet
        open={activityOpen}
        onOpenChange={setActivityOpen}
        events={job?.events ?? []}
        contractRef={summary?.contractRef}
      />
    </div>
  );
}
