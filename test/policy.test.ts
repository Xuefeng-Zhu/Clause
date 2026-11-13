import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { MockIssuingGateway } from "../server/clause/airwallex/mock.js";
import { POLICY_DEMO_CHARGES, summarize } from "../server/clause/app.js";
import { config } from "../server/clause/config.js";
import { computeValidatedExceptionCap } from "../server/clause/expense/exception.js";
import { assertPolicyQuotesAreVerbatim } from "../server/clause/expense/parser.js";
import { PolicyTerms, validatePolicyTerms } from "../server/clause/expense/schema.js";
import { SAMPLE_EXCEPTION_NOTE, SAMPLE_POLICY_TERMS } from "../server/clause/fixtures.js";
import { ContractCardService } from "../server/clause/milestones/service.js";
import { buildPolicyCardPlan, deadlineToActiveTo } from "../server/clause/policy/cardRules.js";
import { explainPolicyDecline } from "../server/clause/policy/declineExplainer.js";
import { MemoryJobStore } from "../server/clause/store/jobStore.js";

const policyDoc = readFileSync(new URL("../samples/policy-acme-trip.txt", import.meta.url), "utf8");
const policyTerms = PolicyTerms.parse(structuredClone(SAMPLE_POLICY_TERMS));

describe("expense policy terms", () => {
  it("sample policy fixture is internally consistent", () => {
    expect(validatePolicyTerms(policyTerms)).toEqual([]);
  });

  it("every quoted clause appears verbatim in the sample policy document", () => {
    const copy = structuredClone(policyTerms);
    assertPolicyQuotesAreVerbatim(copy, { kind: "text", text: policyDoc });
    expect(copy.open_questions).toEqual([]);
  });
});

describe("buildPolicyCardPlan", () => {
  it("derives PER_TRANSACTION=300 and ALL_TIME=2000 limits, travel MCCs, and Nov 23 Pacific active_to with no active_from", () => {
    const plan = buildPolicyCardPlan(policyTerms);
    expect(plan.releasedAmount).toBe(2000);
    expect(plan.controls.transaction_limits).toEqual({
      currency: "USD",
      limits: [
        { amount: 300, interval: "PER_TRANSACTION" },
        { amount: 2000, interval: "ALL_TIME" },
      ],
    });
    expect(plan.controls.allowed_currencies).toEqual(["USD"]);
    expect(plan.controls.allowed_merchant_categories).toEqual([
      "3058",
      "4111",
      "4121",
      "4131",
      "4511",
      "5812",
      "5814",
      "7011",
    ]);
    expect(plan.controls.allowed_merchant_categories).not.toContain("5813");
    expect(plan.controls.allowed_merchant_categories).not.toContain("5732");
    expect(plan.controls.active_from).toBeUndefined();
    expect(plan.controls.active_to).toBe(deadlineToActiveTo("2026-11-23", "-08:00"));
    expect(plan.controls.active_to).toBe("2026-11-24T07:59:59.000Z");

    const clauseIds = plan.rules.map((r) => r.clause.clause_id);
    expect(clauseIds).toContain("§2.2");
    expect(clauseIds).toContain("§3.3");
    expect(clauseIds).toContain("§3.2");
    expect(clauseIds).toContain("§2.1");
  });
});

describe("explainPolicyDecline clause mapping", () => {
  const plan = buildPolicyCardPlan(policyTerms);
  const baseTxn = {
    transaction_id: "txn_1",
    card_id: "card_1",
    currency: "USD",
    transaction_type: "AUTHORIZATION" as const,
    status: "FAILED" as const,
    created_at: "2026-11-19T20:00:00.000Z",
  };

  it("maps prohibited MCCs to §4.2 (bars) and §4.1 (electronics & gift cards)", () => {
    const bar = explainPolicyDecline(
      {
        ...baseTxn,
        amount: 142,
        merchant_name: "Rainey St. Cocktail Bar",
        merchant_category_code: "5813",
        failure_reason: "MERCHANT_CATEGORY_NOT_ALLOWED",
      },
      plan.rules,
      policyTerms,
    );
    expect(bar?.clause_id).toBe("§4.2");
    expect(bar?.prohibited).toBe(true);

    for (const mcc of ["5732", "5734", "5999"]) {
      const item = explainPolicyDecline(
        {
          ...baseTxn,
          amount: 250,
          merchant_name: "Retailer",
          merchant_category_code: mcc,
          failure_reason: "MERCHANT_CATEGORY_NOT_ALLOWED",
        },
        plan.rules,
        policyTerms,
      );
      expect(item?.clause_id).toBe("§4.1");
      expect(item?.prohibited).toBe(true);
    }
  });

  it("maps LIMIT_EXCEEDED above per_charge_cap to §3.3 and prompts for §3.4 exception", () => {
    const dinner = explainPolicyDecline(
      {
        ...baseTxn,
        amount: 480,
        merchant_name: "Uchi Austin",
        merchant_category_code: "5812",
        failure_reason: "LIMIT_EXCEEDED",
      },
      plan.rules,
      policyTerms,
    );
    expect(dinner?.clause_id).toBe("§3.3");
    expect(dinner?.can_request_exception).toBe(true);
    expect(dinner?.headline).toContain("Request an exception (§3.4)");
  });

  it("maps LIMIT_EXCEEDED within per_charge_cap (cumulative budget exhausted) to §2.2", () => {
    const overBudget = explainPolicyDecline(
      {
        ...baseTxn,
        amount: 220,
        merchant_name: "Hyatt Regency Austin",
        merchant_category_code: "7011",
        failure_reason: "LIMIT_EXCEEDED",
      },
      plan.rules,
      policyTerms,
    );
    expect(overBudget?.clause_id).toBe("§2.2");
    expect(overBudget?.can_request_exception).toBeUndefined();
  });

  it("maps OUT_OF_ALLOWED_TIME_RANGE after Nov 23 cutoff to §2.1", () => {
    const late = explainPolicyDecline(
      {
        ...baseTxn,
        amount: 41,
        merchant_name: "Uber Trip",
        merchant_category_code: "4121",
        failure_reason: "OUT_OF_ALLOWED_TIME_RANGE",
      },
      plan.rules,
      policyTerms,
    );
    expect(late?.clause_id).toBe("§2.1");
  });
});

describe("exception cap validation and end-to-end policy card flow", () => {
  let svc: ContractCardService;
  let gateway: MockIssuingGateway;
  let store: MemoryJobStore;

  beforeEach(() => {
    config.anthropic.apiKey = undefined;
    gateway = new MockIssuingGateway();
    store = new MemoryJobStore();
    svc = new ContractCardService(gateway, store, "priya.shah@acme-robotics.example");
  });

  it("enforces cap = 125 × attendees and never allows a cap above 125 × attendees", () => {
    expect(
      computeValidatedExceptionCap({
        client: "Lone Star Logistics",
        attendees: 4,
        attendee_names: ["Dana Ruiz", "Kevin Tran", "Priya Shah", "Marcus Lee"],
        perAttendeeCap: 125,
      }),
    ).toEqual({ max_allowed: 500, one_time_cap: 500 });

    // Clamps requestedCap above 125 * attendees down to 500
    expect(
      computeValidatedExceptionCap({
        client: "Lone Star Logistics",
        attendees: 4,
        attendee_names: ["Dana Ruiz", "Kevin Tran", "Priya Shah", "Marcus Lee"],
        perAttendeeCap: 125,
        requestedCap: 750,
      }),
    ).toEqual({ max_allowed: 500, one_time_cap: 500 });

    // Honors lower requestedCap when <= max_allowed
    expect(
      computeValidatedExceptionCap({
        client: "Lone Star Logistics",
        attendees: 4,
        attendee_names: ["Dana Ruiz", "Kevin Tran", "Priya Shah", "Marcus Lee"],
        perAttendeeCap: 125,
        requestedCap: 420,
      }),
    ).toEqual({ max_allowed: 500, one_time_cap: 420 });

    // Rejects missing attendee names or missing client
    expect(() =>
      computeValidatedExceptionCap({
        client: "",
        attendees: 2,
        attendee_names: ["A", "B"],
        perAttendeeCap: 125,
      }),
    ).toThrow(/client/);

    expect(() =>
      computeValidatedExceptionCap({
        client: "Lone Star Logistics",
        attendees: 4,
        attendee_names: ["Only One"],
        perAttendeeCap: 125,
      }),
    ).toThrow(/fewer than/);
  });

  it("runs the full TR-2611 policy trip flow including preset declines, §3.4 exception approval, retry, and one-time cap restore", async () => {
    // 1. Parse policy + trip request -> draft policy job
    let job = await svc.createJob({ kind: "text", text: policyDoc });
    expect(job.kind).toBe("policy");
    expect(job.status).toBe("draft");
    expect(job.policyTerms?.policy_ref).toBe("TR-2611");

    // 2. Approve & issue trip card
    job = await svc.approveTerms(job.id);
    expect(job.status).toBe("active");
    expect(summarize(job).total).toBe(2000);
    expect(summarize(job).perChargeCap).toBe(300);

    const preset = (key: string) => {
      const p = POLICY_DEMO_CHARGES.find((c) => c.key === key)!;
      return {
        amount: p.amount,
        merchant_name: p.merchant_name,
        mcc: p.mcc,
        ...("at" in p && p.at !== undefined ? { at: p.at } : {}),
      };
    };

    // 3. In-policy hotel ($289) & uber ($34.60) -> APPROVED
    expect((await svc.simulateCharge(job.id, preset("hotel"))).explanation).toBeUndefined();
    expect((await svc.simulateCharge(job.id, preset("uber"))).explanation).toBeUndefined();

    // 4. Out-of-policy bar ($142, 5813) -> DECLINED §4.2
    const bar = await svc.simulateCharge(job.id, preset("bar"));
    expect(bar.explanation?.failure_reason).toBe("MERCHANT_CATEGORY_NOT_ALLOWED");
    expect(bar.explanation?.clause_id).toBe("§4.2");

    // 5. Out-of-policy Best Buy ($899, 5732) -> DECLINED §4.1
    const bestbuy = await svc.simulateCharge(job.id, preset("bestbuy"));
    expect(bestbuy.explanation?.failure_reason).toBe("MERCHANT_CATEGORY_NOT_ALLOWED");
    expect(bestbuy.explanation?.clause_id).toBe("§4.1");

    // 6. Client dinner ($480, 5812) -> DECLINED §3.3 with exception prompt (§3.4)
    const dinner1 = await svc.simulateCharge(job.id, preset("dinner"));
    expect(dinner1.explanation?.failure_reason).toBe("LIMIT_EXCEEDED");
    expect(dinner1.explanation?.clause_id).toBe("§3.3");
    expect(dinner1.explanation?.headline).toContain("Request an exception (§3.4)");

    // 7. Post-expiry Uber on Nov 26 ($41, 4121) -> DECLINED §2.1
    const late = await svc.simulateCharge(job.id, preset("late"));
    expect(late.explanation?.failure_reason).toBe("OUT_OF_ALLOWED_TIME_RANGE");
    expect(late.explanation?.clause_id).toBe("§2.1");

    // 8. Employee requests §3.4 exception; before manager approval, retry still declines
    job = await svc.requestException(job.id, SAMPLE_EXCEPTION_NOTE);
    expect(job.pending?.kind).toBe("policy_exception");
    expect(job.pending?.exception?.attendees).toBe(4);
    expect(job.pending?.exception?.max_allowed).toBe(500);
    expect(job.pending?.exception?.one_time_cap).toBe(500);
    expect(job.pending?.exception?.clause.clause_id).toBe("§3.4");

    expect((await svc.simulateCharge(job.id, preset("dinner"))).explanation?.clause_id).toBe("§3.3");

    // 9. Manager approves exception -> PER_TRANSACTION limit becomes 500
    job = await svc.approveException(job.id, job.pending!.approval_id);
    expect(summarize(job).perChargeCap).toBe(500);
    const cardDuringException = await gateway.getCard(job.card_id!);
    expect(cardDuringException.authorization_controls.transaction_limits?.limits).toEqual([
      { amount: 500, interval: "PER_TRANSACTION" },
      { amount: 2000, interval: "ALL_TIME" },
    ]);

    // 10. Retry dinner ($480) -> APPROVED, then PER_TRANSACTION limit immediately restores to $300
    const dinnerRetry = await svc.simulateCharge(job.id, preset("dinner"));
    expect(dinnerRetry.txn.status).toBe("APPROVED");
    expect(dinnerRetry.explanation).toBeUndefined();

    job = await svc.getJob(job.id);
    expect(job.activeException).toBeUndefined();
    expect(summarize(job).perChargeCap).toBe(300);
    expect(job.events.some((e) => e.detail === "Exception used — per-charge cap back to $300")).toBe(true);

    const cardAfterUse = await gateway.getCard(job.card_id!);
    expect(cardAfterUse.authorization_controls.transaction_limits?.limits).toEqual([
      { amount: 300, interval: "PER_TRANSACTION" },
      { amount: 2000, interval: "ALL_TIME" },
    ]);

    // 11. Second $480 dinner declines again because the exception was one-time
    const secondDinner = await svc.simulateCharge(job.id, preset("dinner"));
    expect(secondDinner.explanation?.failure_reason).toBe("LIMIT_EXCEEDED");
    expect(secondDinner.explanation?.clause_id).toBe("§3.3");
  });
});
