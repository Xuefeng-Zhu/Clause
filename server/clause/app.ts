import { createGateway, type IssuingGateway } from "./airwallex/index.js";
import { config } from "./config.js";
import { SAMPLE_CHANGE_ORDER_EMAIL, SAMPLE_QUOTE } from "./fixtures.js";
import { ContractCardService } from "./milestones/service.js";
import { DEMO_MCC_NAMES } from "./policy/mcc.js";
import type { Job } from "./store/jobStore.js";
import { SqlJobStore } from "./store/sqlJobStore.js";

let gateway: IssuingGateway | undefined;
let service: ContractCardService | undefined;
const store = new SqlJobStore();

export function getService(): ContractCardService {
  gateway ??= createGateway();
  service ??= new ContractCardService(gateway, store, config.demo.contractorEmail);
  return service;
}

export function runtimeInfo() {
  return {
    airwallexMode: config.awx.mode,
    airwallexBaseUrl: config.awx.mode === "sandbox" ? config.awx.baseUrl : "in-memory mock",
    model: config.anthropic.apiKey ? config.anthropic.model : "offline fixtures (no ANTHROPIC_API_KEY)",
  };
}

/** The four charges the demo video uses. Sandbox simulations only; nothing here touches real money. */
export const DEMO_CHARGES = [
  { key: "lumber", label: "Lumber $1,840.50", amount: 1840.5, merchant_name: "Dunn Lumber", mcc: "5211" },
  { key: "lunch", label: "Team lunch $86.40", amount: 86.4, merchant_name: "Kirkland Taphouse", mcc: "5812" },
  { key: "home-depot", label: "Home Depot $2,500", amount: 2500, merchant_name: "Home Depot", mcc: "5200" },
  { key: "after-deadline", label: "Hardware after deadline", amount: 120, merchant_name: "McLendon Hardware", mcc: "5251", at: "2026-12-24T18:00:00.000Z" },
] as const;

export const SAMPLES = { quote: SAMPLE_QUOTE, changeOrderEmail: SAMPLE_CHANGE_ORDER_EMAIL };

/** The view model the UI and the agent both read. Everything money-related is computed here, in code. */
export function summarize(job: Job) {
  const t = job.terms;
  const released = t.milestones.filter((m) => job.releasedMilestoneIds.includes(m.id)).reduce((s, m) => s + m.amount, 0);
  const spent = job.transactions.filter((x) => !x.failure_reason).reduce((s, x) => s + x.amount, 0);
  const next = t.milestones.find((m) => !job.releasedMilestoneIds.includes(m.id));
  return {
    id: job.id,
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
    nextMilestone: next ? { id: next.id, name: next.name, amount: next.amount, evidenceRequired: next.evidence_required, clauseId: next.clause.clause_id } : null,
    pending: job.pending ?? null,
    problems: job.problems,
    parsedBy: job.parsedBy,
    mccNames: DEMO_MCC_NAMES,
  };
}
