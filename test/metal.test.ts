import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MockIssuingGateway } from "../server/clause/airwallex/mock.js";
import { config } from "../server/clause/config.js";
import { ContractTerms } from "../server/clause/contract/schema.js";
import {
  MOCK_CONTRACTOR_ADDRESS,
  MOCK_WRONG_PAYEE_ADDRESS,
  MIN_MANDATE_EXPIRES_IN_SECONDS,
  MockMetalRail,
  USDZ_PER_USD,
  contractToMandateTerms,
  explainMandateRefusal,
  parseMetalCliOutput,
} from "../server/clause/metal/index.js";
import { ContractCardService } from "../server/clause/milestones/service.js";
import { MemoryJobStore } from "../server/clause/store/jobStore.js";

const sampleQuote = readFileSync(
  new URL("../samples/quote-maple-street-cafe.txt", import.meta.url),
  "utf8",
);
const sampleChangeOrderEmail = readFileSync(
  new URL("../samples/change-order-email.txt", import.meta.url),
  "utf8",
);

const sampleTerms = ContractTerms.parse(
  JSON.parse(
    readFileSync(new URL("../samples/quote-maple-street-cafe.terms.json", import.meta.url), "utf8"),
  ),
);

describe("contractToMandateTerms pure mapping", () => {
  it("maps cap, budget, maxOccurrences, expiresIn, description, and clause refs using USDZ_PER_USD = 0.01", () => {
    expect(USDZ_PER_USD).toBe(0.01);
    const nowMs = Date.parse("2026-11-13T00:00:00.000Z");
    const terms = contractToMandateTerms(
      { id: "job_test1234", terms: sampleTerms },
      { payee: MOCK_CONTRACTOR_ADDRESS, nowMs },
    );

    expect(terms.payee).toBe(MOCK_CONTRACTOR_ADDRESS);
    // Largest milestone is M2 ($5,000) -> 50.00 USDZ
    expect(terms.capUsd).toBe(5000);
    expect(terms.cap).toBe(50);
    // Total contract value is $12,000 -> 120.00 USDZ
    expect(terms.budgetUsd).toBe(12000);
    expect(terms.budget).toBe(120);
    expect(terms.maxOccurrences).toBe(3);
    expect(terms.description).toBe(
      `Clause ${sampleTerms.project} — contract ${sampleTerms.contract_ref}`,
    );

    // 2026-12-18T23:59:59-08:00 = 2026-12-19T07:59:59.000Z
    const expectedSeconds = Math.floor(
      (Date.parse("2026-12-19T07:59:59.000Z") - nowMs) / 1000,
    );
    expect(terms.expiresIn).toBe(expectedSeconds);
    expect(terms.expiresIn).toBeGreaterThan(MIN_MANDATE_EXPIRES_IN_SECONDS);

    // Every limit carries its contract clause reference
    expect(terms.clauses.cap.clause_id).toBe("§1.2");
    expect(terms.clauses.budget.clause_id).toBe("§1.1");
    expect(terms.clauses.maxOccurrences.clause_id).toBe("§1.3");
    expect(terms.clauses.expiresIn.clause_id).toBe("§3.2");
    expect(terms.clauses.payee.clause_id).toBe("§1.1");
  });

  it("scales $1,200 milestone to 12.00 USDZ and enforces min 1-day expiresIn floor", () => {
    const customTerms = structuredClone(sampleTerms);
    customTerms.milestones = [
      { ...customTerms.milestones[0]!, id: "M1", amount: 1200 },
      { ...customTerms.milestones[1]!, id: "M2", amount: 800 },
    ];
    customTerms.total_amount = 2000;

    // Simulate now after the deadline -> clamps to 86,400s (1 day)
    const afterDeadlineMs = Date.parse("2027-01-05T00:00:00.000Z");
    const mapped = contractToMandateTerms(
      { id: "job_small", terms: customTerms },
      { payee: "0x1111111111111111111111111111111111111111", nowMs: afterDeadlineMs },
    );

    expect(mapped.cap).toBe(12);
    expect(mapped.budget).toBe(20);
    expect(mapped.maxOccurrences).toBe(2);
    expect(mapped.expiresIn).toBe(MIN_MANDATE_EXPIRES_IN_SECONDS);
    expect(mapped.clauses.cap.clause_id).toBe("§1.1");
  });
});

describe("MockMetalRail deterministic enforcement", () => {
  it("enforces paid, cap exceeded, payee not listed, budget spent, occurrences used, expiry, revocation, and replace carry-over", async () => {
    const rail = new MockMetalRail();
    const job = { id: "job_mock_1", terms: structuredClone(sampleTerms) };
    // Make M1=5000, M2=5000, M3=2000 -> cap=50 USDZ, budget=120 USDZ, maxOccurrences=3
    job.terms.milestones[0]!.amount = 5000;
    job.terms.milestones[1]!.amount = 5000;
    job.terms.milestones[2]!.amount = 2000;
    job.terms.total_amount = 12000;

    const nowMs = Date.parse("2026-11-13T00:00:00.000Z");
    const mandateTerms = contractToMandateTerms(job, {
      payee: MOCK_CONTRACTOR_ADDRESS,
      nowMs,
    });

    const issued = await rail.issueMandate(job, mandateTerms);
    expect(issued.explorerUrl).toBeNull();
    expect(issued.spent).toBe(0);
    expect(issued.budget).toBe(120);

    // 1. Paid within cap & budget
    const p1 = await rail.payout(job, {
      milestoneId: "M1",
      amount: 50,
      to: MOCK_CONTRACTOR_ADDRESS,
      paymentId: "job_mock_1-M1",
    });
    expect(p1.outcome).toBe("paid");
    expect(p1.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(p1.explorerUrl).toBeNull();
    expect(p1.spent).toBe(50);

    // 2. Cap exceeded (60 > 50 cap, even though 50 + 60 = 110 <= 120 budget)
    const overCap = await rail.payout(job, {
      milestoneId: "M2",
      amount: 60,
      to: MOCK_CONTRACTOR_ADDRESS,
      paymentId: "job_mock_1-overcap",
    });
    expect(overCap.outcome).toBe("refused");
    expect(overCap.reason).toBe("mandate_cap_exceeded");
    expect(explainMandateRefusal(overCap.reason, mandateTerms, job.terms).clause.clause_id).toBe(
      mandateTerms.clauses.cap.clause_id,
    );

    // 3. Payee not listed
    const wrongPayee = await rail.payout(job, {
      milestoneId: "M2",
      amount: 20,
      to: MOCK_WRONG_PAYEE_ADDRESS,
      paymentId: "job_mock_1-wrongpayee",
    });
    expect(wrongPayee.outcome).toBe("refused");
    expect(wrongPayee.reason).toBe("mandate_payee_not_listed");
    expect(explainMandateRefusal(wrongPayee.reason, mandateTerms, job.terms).clause.clause_id).toBe(
      "§1.1",
    );

    // 4. Budget spent: pay second 50 USDZ (spent = 100 of 120), then try 30 USDZ (<= 50 cap, but 100 + 30 > 120 budget)
    const p2 = await rail.payout(job, {
      milestoneId: "M2",
      amount: 50,
      to: MOCK_CONTRACTOR_ADDRESS,
      paymentId: "job_mock_1-M2",
    });
    expect(p2.outcome).toBe("paid");
    expect(p2.spent).toBe(100);

    const overBudget = await rail.payout(job, {
      milestoneId: "M3",
      amount: 30,
      to: MOCK_CONTRACTOR_ADDRESS,
      paymentId: "job_mock_1-overbudget",
    });
    expect(overBudget.outcome).toBe("refused");
    expect(overBudget.reason).toBe("mandate_budget_spent");

    // 5. Replace mandate carries over spent (100 USDZ carried into new 150 USDZ budget, cap raised to 60 USDZ, maxOccurrences = 3)
    const upgradedTerms = {
      ...structuredClone(mandateTerms),
      cap: 60,
      capUsd: 6000,
      budget: 150,
      budgetUsd: 15000,
    };
    const replaced = await rail.replaceMandate(job, upgradedTerms);
    expect(replaced.version).toBe(2);
    expect(replaced.spent).toBe(100);
    expect(replaced.budget).toBe(150);

    // 30 USDZ now succeeds under replaced 150 USDZ budget (3rd occurrence of 3)
    const p3 = await rail.payout(job, {
      milestoneId: "M3",
      amount: 30,
      to: MOCK_CONTRACTOR_ADDRESS,
      paymentId: "job_mock_1-M3",
    });
    expect(p3.outcome).toBe("paid");
    expect(p3.spent).toBe(130);
    expect(p3.occurrencesUsed).toBe(3);

    // 6. Occurrences used (already used 3 of 3, even though 20 USDZ remains in budget)
    const overOcc = await rail.payout(job, {
      milestoneId: "M4",
      amount: 10,
      to: MOCK_CONTRACTOR_ADDRESS,
      paymentId: "job_mock_1-overocc",
    });
    expect(overOcc.outcome).toBe("refused");
    expect(overOcc.reason).toBe("mandate_occurrences_used");

    // 7. Verify counts payments & refusals
    const verification = await rail.verify(job);
    expect(verification.verified).toBe(true);
    expect(verification.payments).toBe(3);
    expect(verification.refusals).toBe(4);
    expect(verification.summary).toBe("Verified on chain ✓ — 3 payments, 4 refusals");

    // 8. Expiry & revocation checks
    const expiredJob = { id: "job_exp", terms: structuredClone(sampleTerms) };
    await rail.issueMandate(expiredJob, mandateTerms);
    const expRes = await rail.payout(expiredJob, {
      milestoneId: "M1",
      amount: 10,
      to: MOCK_CONTRACTOR_ADDRESS,
      paymentId: "job_exp-M1",
      at: "2027-02-01T00:00:00.000Z",
    });
    expect(expRes).toMatchObject({ outcome: "refused", reason: "mandate_expired" });

    rail.revokeForTest(expiredJob.id);
    const revRes = await rail.payout(expiredJob, {
      milestoneId: "M1",
      amount: 10,
      to: MOCK_CONTRACTOR_ADDRESS,
      paymentId: "job_exp-M1-rev",
    });
    expect(revRes).toMatchObject({ outcome: "refused", reason: "mandate_revoked" });
  });
});

describe("parseMetalCliOutput", () => {
  it("parses paid pull, refused pull, and verify output from metal-agent CLI", () => {
    const paid = parseMetalCliOutput(
      "transaction 0x5bc5cfedec4aef1bafbbfdfd4878078fd349830457e68fe0568c8b0f69f8e724\noutcome paid\nspent 4 *USDZ of 10 *USDZ\nexplorer https://explorer.example/tx/0x5bc5\n",
    );
    expect(paid.outcome).toBe("paid");
    expect(paid.txHash).toBe("0x5bc5cfedec4aef1bafbbfdfd4878078fd349830457e68fe0568c8b0f69f8e724");
    expect(paid.spent).toBe(4);
    expect(paid.budget).toBe(10);
    expect(paid.explorerUrl).toBe("https://explorer.example/tx/0x5bc5");

    const refused = parseMetalCliOutput(
      "outcome refused, not sent\nreason mandate_cap_exceeded (the amount is above the mandate's per-payment cap)\n",
    );
    expect(refused.outcome).toBe("refused, not sent");
    expect(refused.reason).toBe("mandate_cap_exceeded");
    expect(refused.reasonDetail).toContain("per-payment cap");

    const verified = parseMetalCliOutput(
      "mandate 0x9c0f39190e788272006c9f4fcd28ea6a060d47c181e2f5418b3b2fb3deb5a381\n  1 payment(s) and 0 refusal(s), each the bound mandate key's per-payment mandate\nverified yes\n",
    );
    expect(verified.verified).toBe(true);
    expect(verified.verifyPayments).toBe(1);
    expect(verified.verifyRefusals).toBe(0);
    expect(verified.mandateId).toBe(
      "0x9c0f39190e788272006c9f4fcd28ea6a060d47c181e2f5418b3b2fb3deb5a381",
    );
  });
});

describe("Airwallex simulateDeposit treasury mirror", () => {
  it("records simulated USD deposit with Metal payout payer_name prefix", async () => {
    const gw = new MockIssuingGateway(10_000);
    const dep = await gw.simulateDeposit({
      amount: 5000,
      reference: "0x5bc5cfedec4aef1bafbbfdfd4878078fd3498304",
    });
    expect(dep.amount).toBe(5000);
    expect(dep.currency).toBe("USD");
    expect(dep.payer_name).toBe("Metal payout 0x5bc5cfed");
    expect(gw.deposits).toHaveLength(1);
    expect(gw.walletBalance).toBe(15_000);
  });
});

describe("ContractCardService + Metal mandate lifecycle", () => {
  it("issues mandate on approveTerms, pays on approveRelease (+ mirrors deposit), refuses overpay & wrong-payee citing clauses, replaces on change order, and verifies", async () => {
    config.anthropic.apiKey = undefined;
    const gw = new MockIssuingGateway();
    const store = new MemoryJobStore();
    const metal = new MockMetalRail();
    const svc = new ContractCardService(gw, store, "contractor@example.com", metal);

    // 1. Create & approve terms -> binds Metal mandate (cap = 50 USDZ, budget = 120 USDZ, maxOccurrences = 3)
    let job = await svc.createJob({ kind: "text", text: sampleQuote });
    job = await svc.approveTerms(job.id);
    expect(job.mandate).toBeDefined();
    expect(job.mandate?.terms.cap).toBe(50);
    expect(job.mandate?.terms.budget).toBe(120);
    expect(job.mandate?.terms.maxOccurrences).toBe(3);
    expect(job.mandate?.spent).toBe(0);

    // 2. Overpay attempt (2× cap = 100 USDZ) -> refused mandate_cap_exceeded citing §1.2
    const overpay = await svc.metalOverpayAttempt(job.id);
    expect(overpay.result.outcome).toBe("refused");
    expect(overpay.result.reason).toBe("mandate_cap_exceeded");
    expect(overpay.clause.clause_id).toBe("§1.2");
    expect(
      overpay.job.events.some(
        (e) => e.type === "metal_refused" && e.detail.includes("mandate_cap_exceeded") && e.detail.includes("§1.2"),
      ),
    ).toBe(true);

    // 3. Wrong-payee attempt -> refused mandate_payee_not_listed citing §1.1
    const wrongPayee = await svc.metalWrongPayeeAttempt(job.id);
    expect(wrongPayee.result.outcome).toBe("refused");
    expect(wrongPayee.result.reason).toBe("mandate_payee_not_listed");
    expect(wrongPayee.clause.clause_id).toBe("§1.1");
    expect(
      wrongPayee.job.events.some(
        (e) => e.type === "metal_refused" && e.detail.includes("mandate_payee_not_listed") && e.detail.includes("§1.1"),
      ),
    ).toBe(true);

    // 4. Submit proof & approveRelease for M2 ($5,000) -> pays 50.00 USDZ on Metal + mirrors $5,000 deposit on Airwallex
    job = await svc.submitProof(job.id, [
      { filename: "cabinets.jpg", mediaType: "image/jpeg", base64: "AA==", declaredKind: "photos" },
    ]);
    job = await svc.approveRelease(job.id, {
      approval_id: job.pending!.approval_id,
      milestone_id: "M2",
      amount: 5000,
    });
    const m2 = job.terms.milestones.find((m) => m.id === "M2")!;
    expect(m2.payout?.outcome).toBe("paid");
    expect(m2.payout?.amount).toBe(50);
    expect(m2.payout?.amount_usd).toBe(5000);
    expect(m2.payout?.tx_hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(job.mandate?.spent).toBe(50);
    expect(job.mandate?.occurrencesUsed).toBe(1);
    expect(
      job.events.some(
        (e) => e.type === "metal_payout" && e.detail.startsWith("Paid 50.00 USDZ on Metal · tx 0x"),
      ),
    ).toBe(true);
    expect(gw.deposits).toHaveLength(1);
    expect(gw.deposits[0]?.amount).toBe(5000);
    expect(gw.deposits[0]?.payer_name).toMatch(/^Metal payout 0x/);

    // 5. Approve change order (+$800 on M2 -> $5,800, total -> $12,800) -> replaces mandate with cap=58, budget=128, carrying 50 USDZ spent over
    job = await svc.proposeChangeOrder(job.id, sampleChangeOrderEmail);
    job = await svc.approveChangeOrder(job.id, job.pending!.approval_id);
    expect(job.mandate?.version).toBe(2);
    expect(job.mandate?.terms.cap).toBe(58);
    expect(job.mandate?.budget).toBe(128);
    expect(job.mandate?.spent).toBe(50);
    expect(job.events.some((e) => e.type === "mandate_replaced")).toBe(true);

    // 6. Verify mandate -> "Verified on chain ✓ — 1 payments, 2 refusals"
    const verified = await svc.metalVerify(job.id);
    expect(verified.verification.verified).toBe(true);
    expect(verified.verification.payments).toBe(1);
    expect(verified.verification.refusals).toBe(2);
    expect(verified.verification.summary).toBe("Verified on chain ✓ — 1 payments, 2 refusals");
  });
});
