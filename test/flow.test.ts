import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { MockIssuingGateway } from "../server/clause/airwallex/mock.js";
import { summarize } from "../server/clause/app.js";
import { config } from "../server/clause/config.js";
import { applyChangeOrder } from "../server/clause/contract/changeOrder.js";
import { assertQuotesAreVerbatim } from "../server/clause/contract/parser.js";
import { ContractTerms, validateTerms } from "../server/clause/contract/schema.js";
import { ContractCardService } from "../server/clause/milestones/service.js";
import { buildCardPlan, deadlineToActiveTo } from "../server/clause/policy/cardRules.js";
import { MemoryJobStore } from "../server/clause/store/jobStore.js";

const quote = readFileSync(new URL("../samples/quote-maple-street-cafe.txt", import.meta.url), "utf8");
const email = readFileSync(new URL("../samples/change-order-email.txt", import.meta.url), "utf8");
const terms = ContractTerms.parse(JSON.parse(readFileSync(new URL("../samples/quote-maple-street-cafe.terms.json", import.meta.url), "utf8")));

describe("contract terms", () => {
  it("sample fixture is internally consistent", () => {
    expect(validateTerms(terms)).toEqual([]);
  });
  it("every quoted clause appears verbatim in the sample quote", () => {
    const t = structuredClone(terms);
    assertQuotesAreVerbatim(t, { kind: "text", text: quote });
    expect(t.open_questions).toEqual([]);
  });
  it("flags milestones that don't sum to the total", () => {
    const bad = { ...structuredClone(terms), total_amount: 13000 };
    expect(validateTerms(bad).join()).toMatch(/sum to 12000/);
  });
});

describe("card plan", () => {
  it("opens at the deposit, building-supply MCCs, deadline end-of-day Pacific", () => {
    const plan = buildCardPlan(terms, ["M1"]);
    expect(plan.releasedAmount).toBe(4000);
    expect(plan.controls.transaction_limits?.limits).toEqual([{ amount: 4000, interval: "ALL_TIME" }]);
    expect(plan.controls.allowed_merchant_categories).toContain("5211");
    expect(plan.controls.allowed_merchant_categories).not.toContain("5812");
    expect(plan.controls.active_to).toBe(deadlineToActiveTo("2026-12-18"));
    expect(plan.controls.active_to).toBe("2026-12-19T07:59:59.000Z");
  });
  it("refuses a zero-limit card", () => {
    expect(() => buildCardPlan(terms, [])).toThrow();
  });
  it("change order re-derives total and deadline", () => {
    const next = applyChangeOrder(terms, {
      summary: "",
      milestone_amount_changes: [{ milestone_id: "M2", new_amount: 5800, reason: "" }],
      new_deadline: "2026-12-23",
      requires_signed_change_order: true,
      source_quote: "until December 23",
    });
    expect(next.total_amount).toBe(12800);
    expect(buildCardPlan(next, ["M1", "M2"]).releasedAmount).toBe(9800);
  });
});

describe("end-to-end on the mock gateway", () => {
  let svc: ContractCardService;
  let gateway: MockIssuingGateway;
  let store: MemoryJobStore;

  beforeEach(() => {
    config.anthropic.apiKey = undefined;
    gateway = new MockIssuingGateway();
    store = new MemoryJobStore();
    svc = new ContractCardService(gateway, store, "contractor@example.com");
  });

  async function issued() {
    const job = await svc.createJob({ kind: "text", text: quote });
    return svc.approveTerms(job.id);
  }

  it("declines a restaurant with MERCHANT_CATEGORY_NOT_ALLOWED citing §2.1", async () => {
    const job = await issued();
    const { explanation } = await svc.simulateCharge(job.id, { amount: 86.4, merchant_name: "Taphouse", mcc: "5812" });
    expect(explanation?.failure_reason).toBe("MERCHANT_CATEGORY_NOT_ALLOWED");
    expect(explanation?.clause_id).toBe("§2.1");
  });

  it("declines after the deadline with OUT_OF_ALLOWED_TIME_RANGE citing §3.2", async () => {
    const job = await issued();
    const { explanation } = await svc.simulateCharge(job.id, { amount: 50, merchant_name: "Hardware", mcc: "5251", at: "2026-12-20T18:00:00Z" });
    expect(explanation?.failure_reason).toBe("OUT_OF_ALLOWED_TIME_RANGE");
    expect(explanation?.clause_id).toBe("§3.2");
  });

  it("limit is cumulative and inclusive; proof + approval raises it", async () => {
    let job = await issued();
    expect((await svc.simulateCharge(job.id, { amount: 4000, merchant_name: "Lumber", mcc: "5211" })).explanation).toBeUndefined();
    const over = await svc.simulateCharge(job.id, { amount: 0.01, merchant_name: "Lumber", mcc: "5211" });
    expect(over.explanation?.failure_reason).toBe("LIMIT_EXCEEDED");
    expect(over.explanation?.clause_id).toBe("§1.1");

    job = await svc.submitProof(job.id, [{ filename: "cabinets.jpg", mediaType: "image/jpeg", base64: "AA==", declaredKind: "photos" }]);
    expect(job.pending?.verdict?.verdict).toBe("meets");
    const p = job.pending!;
    await expect(svc.approveRelease(job.id, { approval_id: p.approval_id, milestone_id: "M2", amount: 9999 })).rejects.toThrow(/does not match/);
    job = await svc.approveRelease(job.id, { approval_id: p.approval_id, milestone_id: "M2", amount: 5000 });
    expect(job.releasedMilestoneIds).toEqual(["M1", "M2"]);
    expect((await svc.simulateCharge(job.id, { amount: 2500, merchant_name: "Home Depot", mcc: "5200" })).explanation).toBeUndefined();
  });

  it("missing evidence kinds are rejected in code before any model call", async () => {
    let job = await issued();
    job = await svc.submitProof(job.id, [{ filename: "cabinets.jpg", mediaType: "image/jpeg", base64: "AA==", declaredKind: "photos" }]);
    job = await svc.approveRelease(job.id, { approval_id: job.pending!.approval_id, milestone_id: "M2", amount: 5000 });
    job = await svc.submitProof(job.id, [{ filename: "final.jpg", mediaType: "image/jpeg", base64: "AA==", declaredKind: "photos" }]);
    expect(job.pending?.verdict?.verdict).toBe("insufficient");
    expect(job.pending?.verdict?.missing).toEqual(["inspection_report", "walkthrough_signoff"]);
    await expect(svc.approveRelease(job.id, { approval_id: job.pending!.approval_id, milestone_id: "M3", amount: 3000 })).rejects.toThrow(/insufficient/);
  });

  it("change order moves the deadline only after approval", async () => {
    let job = await issued();
    job = await svc.proposeChangeOrder(job.id, email);
    const late = { amount: 50, merchant_name: "Hardware", mcc: "5251", at: "2026-12-21T18:00:00Z" };
    expect((await svc.simulateCharge(job.id, late)).explanation?.failure_reason).toBe("OUT_OF_ALLOWED_TIME_RANGE");
    job = await svc.approveChangeOrder(job.id, job.pending!.approval_id);
    expect((await svc.simulateCharge(job.id, late)).explanation).toBeUndefined();
  });

  it("frozen card declines with CARD_INACTIVE", async () => {
    const job = await issued();
    await svc.freeze(job.id, true);
    const { explanation } = await svc.simulateCharge(job.id, { amount: 10, merchant_name: "Lumber", mcc: "5211" });
    expect(explanation?.failure_reason).toBe("CARD_INACTIVE");
  });

  it("runs the full 9-step Maple Street Café demo flow on MemoryJobStore and MockIssuingGateway", async () => {
    // 1. Parse contractor quote -> draft job
    let job = await svc.createJob({ kind: "text", text: quote });
    expect(job.status).toBe("draft");
    expect(job.terms.contract_ref).toBe("Q-2026-0412");

    // 2. Owner approves terms -> card issued at M1 ($4,000) deposit
    job = await svc.approveTerms(job.id);
    expect(job.status).toBe("active");
    expect(summarize(job).released).toBe(4000);

    // 3. Normal material spend: Dunn Lumber $1,840.50 -> APPROVED
    const lumber = await svc.simulateCharge(job.id, { amount: 1840.5, merchant_name: "Dunn Lumber", mcc: "5211" });
    expect(lumber.txn.status).toBe("APPROVED");
    expect(lumber.explanation).toBeUndefined();

    // 4. Out-of-policy merchant: Kirkland Taphouse $86.40 -> FAILED citing §2.1
    const lunch = await svc.simulateCharge(job.id, { amount: 86.4, merchant_name: "Kirkland Taphouse", mcc: "5812" });
    expect(lunch.explanation?.failure_reason).toBe("MERCHANT_CATEGORY_NOT_ALLOWED");
    expect(lunch.explanation?.clause_id).toBe("§2.1");

    // 5. Ahead-of-schedule spend: Home Depot $2,500 -> FAILED citing §1.1 ($1,840.50 + $2,500 > $4,000)
    const earlyHomeDepot = await svc.simulateCharge(job.id, { amount: 2500, merchant_name: "Home Depot", mcc: "5200" });
    expect(earlyHomeDepot.explanation?.failure_reason).toBe("LIMIT_EXCEEDED");
    expect(earlyHomeDepot.explanation?.clause_id).toBe("§1.1");

    // 6. Contractor submits proof for M2 + owner approves bound release -> limit rises to $9,000
    job = await svc.submitProof(job.id, [
      { filename: "cabinets-installed.jpg", mediaType: "image/jpeg", base64: "AA==", declaredKind: "photos" },
    ]);
    expect(job.pending?.kind).toBe("release_milestone");
    expect(job.pending?.verdict?.verdict).toBe("meets");
    job = await svc.approveRelease(job.id, {
      approval_id: job.pending!.approval_id,
      milestone_id: "M2",
      amount: 5000,
      currency: "USD",
      evidence_sha256: job.pending!.evidence_sha256!,
    });
    expect(summarize(job).released).toBe(9000);

    // 7. Retry Home Depot $2,500 -> APPROVED now that M2 is released
    const retryHomeDepot = await svc.simulateCharge(job.id, { amount: 2500, merchant_name: "Home Depot", mcc: "5200" });
    expect(retryHomeDepot.txn.status).toBe("APPROVED");
    expect(retryHomeDepot.explanation).toBeUndefined();

    // 8. Contractor emails quartz substitution (+$800 on M2, deadline Dec 23) -> draft + approve change order
    job = await svc.proposeChangeOrder(job.id, email);
    expect(job.pending?.kind).toBe("change_order");
    job = await svc.approveChangeOrder(job.id, job.pending!.approval_id);
    const afterCo = summarize(job);
    expect(afterCo.total).toBe(12800);
    expect(afterCo.released).toBe(9800);
    expect(afterCo.deadline).toBe("2026-12-23");

    // 9. Post-deadline charge (Dec 24) -> FAILED with OUT_OF_ALLOWED_TIME_RANGE
    const afterDeadline = await svc.simulateCharge(job.id, {
      amount: 120,
      merchant_name: "McLendon Hardware",
      mcc: "5251",
      at: "2026-12-24T18:00:00.000Z",
    });
    expect(afterDeadline.explanation?.failure_reason).toBe("OUT_OF_ALLOWED_TIME_RANGE");
    expect(afterDeadline.explanation?.clause_id).toBe("Change order");
  });
});
