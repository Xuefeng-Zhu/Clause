import { createGateway, type IssuingGateway } from "./airwallex/index.js";
import { config, resolveMetalMode, syncScopedCredentials } from "./config.js";
import {
  SAMPLE_CHANGE_ORDER_EMAIL,
  SAMPLE_EXCEPTION_NOTE,
  SAMPLE_POLICY,
  SAMPLE_QUOTE,
} from "./fixtures.js";
import { createMetalRail, type MetalRail } from "./metal/index.js";
import { ContractCardService } from "./milestones/service.js";
import { DEMO_MCC_NAMES } from "./policy/mcc.js";
import type { Job } from "./store/jobStore.js";
import { SqlJobStore } from "./store/sqlJobStore.js";

let mockGateway: IssuingGateway | undefined;
let mockMetalRail: MetalRail | undefined;
const store = new SqlJobStore();

export async function getService(): Promise<ContractCardService> {
  await syncScopedCredentials();
  const gateway =
    config.awx.mode === "sandbox"
      ? createGateway()
      : (mockGateway ??= createGateway());
  const metalMode = resolveMetalMode();
  const metal =
    metalMode === "testnet"
      ? createMetalRail()
      : (mockMetalRail ??= createMetalRail());
  return new ContractCardService(gateway, store, config.demo.contractorEmail, metal);
}

export async function resetRuntime(): Promise<void> {
  await store.reset();
  mockGateway = undefined;
  mockMetalRail?.reset?.();
  mockMetalRail = undefined;
}

export function runtimeInfo() {
  const metalMode = resolveMetalMode();
  return {
    airwallexMode: config.awx.mode,
    airwallexBaseUrl: config.awx.mode === "sandbox" ? config.awx.baseUrl : "in-memory mock",
    metalMode,
    metalNetwork: metalMode === "testnet" ? "Metal Testnet (*USDZ)" : "in-memory mock",
    model: config.anthropic.apiKey ? config.anthropic.model : "offline fixtures (no ANTHROPIC_API_KEY)",
  };
}

/** The four charges the contractor demo video uses. Sandbox simulations only; nothing here touches real money. */
export const DEMO_CHARGES = [
  { key: "lumber", label: "Lumber $1,840.50", amount: 1840.5, merchant_name: "Dunn Lumber", mcc: "5211" },
  { key: "lunch", label: "Team lunch $86.40", amount: 86.4, merchant_name: "Kirkland Taphouse", mcc: "5812" },
  { key: "home-depot", label: "Home Depot $2,500", amount: 2500, merchant_name: "Home Depot", mcc: "5200" },
  { key: "after-deadline", label: "Hardware after deadline", amount: 120, merchant_name: "McLendon Hardware", mcc: "5251", at: "2026-12-24T18:00:00.000Z" },
] as const;

/** Preset charges for the travel & expense policy demo (TR-2611). */
export const POLICY_DEMO_CHARGES = [
  { key: "hotel", label: "Hyatt Regency Austin $289.00", amount: 289, merchant_name: "Hyatt Regency Austin", mcc: "7011" },
  { key: "uber", label: "Uber Trip $34.60", amount: 34.6, merchant_name: "Uber Trip", mcc: "4121" },
  { key: "bar", label: "Rainey St. Cocktail Bar $142.00", amount: 142, merchant_name: "Rainey St. Cocktail Bar", mcc: "5813" },
  { key: "bestbuy", label: "Best Buy #512 $899.00", amount: 899, merchant_name: "Best Buy #512", mcc: "5732" },
  { key: "dinner", label: "Uchi Austin $480.00", amount: 480, merchant_name: "Uchi Austin", mcc: "5812" },
  { key: "late", label: "Uber Trip (Nov 26) $41.00", amount: 41, merchant_name: "Uber Trip", mcc: "4121", at: "2026-11-26T18:00:00.000Z" },
] as const;

export const ALL_DEMO_CHARGES = [...DEMO_CHARGES, ...POLICY_DEMO_CHARGES] as const;

export const SAMPLES = {
  quote: SAMPLE_QUOTE,
  changeOrderEmail: SAMPLE_CHANGE_ORDER_EMAIL,
  policy: SAMPLE_POLICY,
  exceptionNote: SAMPLE_EXCEPTION_NOTE,
};

/** The view model the UI and the agent both read. Everything money-related is computed here, in code. */
export function summarize(job: Job) {
  const spent = Math.round(
    job.transactions.filter((x) => !x.failure_reason).reduce((s, x) => s + x.amount, 0) * 100,
  ) / 100;

  if (job.kind === "policy" && job.policyTerms) {
    const pt = job.policyTerms;
    const budget = pt.budget.amount;
    const released = job.status === "draft" ? 0 : budget;
    const available = Math.round(((job.status === "draft" ? budget : released) - spent) * 100) / 100;
    const perChargeCap = job.activeException
      ? job.activeException.one_time_cap
      : pt.per_charge_cap.amount;
    return {
      id: job.id,
      kind: "policy" as const,
      status: job.status,
      contractRef: pt.policy_ref,
      contractor: pt.traveler,
      client: pt.company,
      approver: pt.approver,
      project: pt.purpose,
      currency: pt.currency,
      total: budget,
      released,
      spent,
      available,
      deadline: pt.card_expires.date,
      tripStart: pt.trip_start,
      tripEnd: pt.trip_end,
      perChargeCap,
      basePerChargeCap: pt.per_charge_cap.amount,
      activeException: job.activeException ?? null,
      cardId: job.card_id ?? null,
      metal: null,
      nextMilestone: null,
      pending: job.pending ?? null,
      problems: job.problems,
      parsedBy: job.parsedBy,
      mccNames: DEMO_MCC_NAMES,
    };
  }

  const t = job.terms;
  const released = t.milestones.filter((m) => job.releasedMilestoneIds.includes(m.id)).reduce((s, m) => s + m.amount, 0);
  const next = t.milestones.find((m) => !job.releasedMilestoneIds.includes(m.id));
  return {
    id: job.id,
    kind: "contract" as const,
    status: job.status,
    contractRef: t.contract_ref,
    contractor: t.contractor_name,
    client: t.client_name,
    project: t.project,
    currency: t.currency,
    total: t.total_amount,
    released,
    spent,
    available: Math.round((released - spent) * 100) / 100,
    deadline: t.deadline.date,
    cardId: job.card_id ?? null,
    metal: job.mandate
      ? {
          mode: job.mandate.mode,
          mandateId: job.mandate.mandateId,
          version: job.mandate.version,
          payee: job.mandate.terms.payee,
          cap: job.mandate.terms.cap,
          capUsd: job.mandate.terms.capUsd,
          budget: job.mandate.budget,
          budgetUsd: job.mandate.terms.budgetUsd,
          spent: job.mandate.spent,
          occurrencesUsed: job.mandate.occurrencesUsed,
          maxOccurrences: job.mandate.terms.maxOccurrences,
          verified: job.mandate.verified ?? null,
        }
      : null,
    nextMilestone: next ? { id: next.id, name: next.name, amount: next.amount, evidenceRequired: next.evidence_required, clauseId: next.clause.clause_id } : null,
    pending: job.pending ?? null,
    problems: job.problems,
    parsedBy: job.parsedBy,
    mccNames: DEMO_MCC_NAMES,
  };
}
