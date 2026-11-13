// @vitest-environment happy-dom
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tabler/icons-react", () => {
  const StubIcon = () => null;
  const names = [
    "IconAlertTriangle",
    "IconArrowRight",
    "IconCamera",
    "IconCheck",
    "IconChevronDown",
    "IconCircleCheck",
    "IconCircleX",
    "IconClock",
    "IconCreditCard",
    "IconDownload",
    "IconFileCheck",
    "IconFileDiff",
    "IconFileText",
    "IconFlask",
    "IconHistory",
    "IconLoader2",
    "IconLock",
    "IconMessageChatbot",
    "IconPhoto",
    "IconPlayerPause",
    "IconPlayerPlay",
    "IconPlus",
    "IconReceipt2",
    "IconRefresh",
    "IconSettings",
    "IconShieldCheck",
    "IconSparkles",
    "IconUpload",
    "IconUser",
    "IconX",
  ];
  return Object.fromEntries(names.map((n) => [n, StubIcon]));
});

import { ActionBar } from "../app/components/clause/ActionBar";
import { EnforcementPanel } from "../app/components/clause/EnforcementPanel";
import { ExpenseReportSheet } from "../app/components/clause/ExpenseReportSheet";
import type { ClauseJob, JobSummary } from "../app/components/clause/clause-types";
import { TooltipProvider } from "../app/components/ui/tooltip";
import { MockIssuingGateway } from "../server/clause/airwallex/mock";
import { POLICY_DEMO_CHARGES, SAMPLES, summarize } from "../server/clause/app";
import { config } from "../server/clause/config";
import { SAMPLE_EXCEPTION_NOTE } from "../server/clause/fixtures";
import { ContractCardService } from "../server/clause/milestones/service";
import { MemoryJobStore } from "../server/clause/store/jobStore";

const policyDoc = SAMPLES.policy;

describe("policy workspace UI components", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders #approveException card for pending policy_exception and opens #expenseReport / exports CSV via #exportReport", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    config.anthropic.apiKey = undefined;
    const svc = new ContractCardService(
      new MockIssuingGateway(),
      new MemoryJobStore(),
      "priya.shah@acme-robotics.example",
    );

    let job = await svc.createJob({ kind: "text", text: policyDoc });
    job = await svc.approveTerms(job.id);

    const hotel = POLICY_DEMO_CHARGES.find((c) => c.key === "hotel")!;
    const bar = POLICY_DEMO_CHARGES.find((c) => c.key === "bar")!;
    const dinner = POLICY_DEMO_CHARGES.find((c) => c.key === "dinner")!;

    await svc.simulateCharge(job.id, {
      amount: hotel.amount,
      merchant_name: hotel.merchant_name,
      mcc: hotel.mcc,
    });
    await svc.simulateCharge(job.id, {
      amount: bar.amount,
      merchant_name: bar.merchant_name,
      mcc: bar.mcc,
    });
    await svc.simulateCharge(job.id, {
      amount: dinner.amount,
      merchant_name: dinner.merchant_name,
      mcc: dinner.mcc,
    });

    job = await svc.requestException(job.id, SAMPLE_EXCEPTION_NOTE);
    const uiJob = job as unknown as ClauseJob;
    const uiSummary = summarize(job) as unknown as JobSummary;

    const onApproveException = vi.fn();
    const onOpenExpenseReport = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        createElement(
          TooltipProvider,
          null,
          createElement(EnforcementPanel, {
            job: uiJob,
            summary: uiSummary,
            isFrozen: false,
            busy: false,
            activeClauseId: null,
            onHoverClause: () => {},
            onSelectClause: () => {},
            onToggleFreeze: () => {},
            onAskClause: () => {},
            onApproveException,
            onRejectPending: () => {},
          }),
          createElement(ActionBar, {
            job: uiJob,
            summary: uiSummary,
            busyLabel: null,
            onCancelBusy: () => {},
            onApproveTerms: () => {},
            proofSheetOpen: false,
            onProofSheetOpenChange: () => {},
            proofKind: "photos",
            onProofKindChange: () => {},
            proofInputRef: createRef<HTMLInputElement>(),
            stagedProofFiles: [],
            onStageSelectedFiles: () => {},
            onRemoveStagedFile: () => {},
            onSubmitProof: () => {},
            onApproveRelease: () => {},
            coSheetOpen: false,
            onCoSheetOpenChange: () => {},
            coEmailText: "",
            onCoEmailTextChange: () => {},
            onDraftChangeOrder: () => {},
            onApproveChangeOrder: () => {},
            onRejectPending: () => {},
            onOpenExpenseReport,
          }),
        ),
      );
    });

    const approveBtn = document.querySelector<HTMLButtonElement>("#approveException");
    expect(approveBtn).not.toBeNull();
    expect(document.body.textContent).toContain("Exception for Marcus Lee");
    expect(document.body.textContent).toContain("Lone Star Logistics");

    act(() => {
      approveBtn!.click();
    });
    expect(onApproveException).toHaveBeenCalledTimes(1);

    const reportBtn = document.querySelector<HTMLButtonElement>("#expenseReport");
    expect(reportBtn).not.toBeNull();
    expect(reportBtn!.textContent).toContain("Expense report — auto-generated");

    act(() => {
      reportBtn!.click();
    });
    expect(onOpenExpenseReport).toHaveBeenCalledTimes(1);

    // Render open ExpenseReportSheet and verify #exportReport + zero-reimbursement line
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-expense-csv");
    const revokeObjectUrlSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    act(() => {
      root!.render(
        createElement(ExpenseReportSheet, {
          open: true,
          onOpenChange: () => {},
          job: uiJob,
          summary: uiSummary,
        }),
      );
    });

    expect(document.body.textContent).toContain(
      "Owed to employee: $0.00 — nothing to reimburse",
    );
    expect(document.body.textContent).toContain("Hyatt Regency Austin");
    expect(document.body.textContent).toContain("Receipt: matched by card controls");
    expect(document.body.textContent).toContain("Rainey St. Cocktail Bar");

    const exportBtn = document.querySelector<HTMLButtonElement>("#exportReport");
    expect(exportBtn).not.toBeNull();

    act(() => {
      exportBtn!.click();
    });

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
  });
});
