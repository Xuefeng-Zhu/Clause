import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
