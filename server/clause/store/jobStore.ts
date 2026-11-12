import type { IssuingTransaction } from "../airwallex/types.js";
import type { ChangeOrderProposal } from "../contract/changeOrder.js";
import type { ContractTerms } from "../contract/schema.js";
import type { EvidenceVerdict } from "../milestones/evidence.js";
import type { CardRule } from "../policy/cardRules.js";
import type { DeclineExplanation } from "../policy/declineExplainer.js";

export type JobStatus = "draft" | "active" | "closed";

/** An approval is bound to exactly what the owner saw. Changing any field invalidates it. */
export interface PendingApproval {
  approval_id: string;
  kind: "release_milestone" | "change_order";
  milestone_id?: string;
  amount?: number;
  currency: string;
  evidence_sha256?: string;
  verdict?: EvidenceVerdict;
  change_order?: ChangeOrderProposal;
  created_at: string;
}

export interface JobEvent {
  at: string;
  type:
    | "terms_parsed"
    | "terms_approved"
    | "card_issued"
    | "charge_approved"
    | "charge_declined"
    | "proof_submitted"
    | "release_approved"
    | "release_rejected"
    | "change_order_drafted"
    | "change_order_approved"
    | "card_frozen"
    | "card_closed";
  detail: string;
  data?: unknown;
}

export interface Job {
  id: string;
  status: JobStatus;
  terms: ContractTerms;
  problems: string[];
  parsedBy: string;
  cardholder_id?: string;
  card_id?: string;
  releasedMilestoneIds: string[];
  rules: CardRule[];
  pending?: PendingApproval;
  transactions: (IssuingTransaction & { explanation?: DeclineExplanation })[];
  events: JobEvent[];
  created_at?: string;
}

/** Where jobs live. The app uses SqlJobStore (drizzle); tests can use MemoryJobStore. */
export interface JobStore {
  get(id: string): Promise<Job>;
  list(): Promise<Job[]>;
  save(job: Job): Promise<Job>;
  reset(): Promise<void>;
}

export class MemoryJobStore implements JobStore {
  private jobs = new Map<string, Job>();
  async get(id: string): Promise<Job> {
    const j = this.jobs.get(id);
    if (!j) throw new Error(`Job ${id} not found`);
    return structuredClone(j);
  }
  async list(): Promise<Job[]> {
    return [...this.jobs.values()].map((j) => structuredClone(j));
  }
  async save(job: Job): Promise<Job> {
    this.jobs.set(job.id, structuredClone(job));
    return job;
  }
  async reset(): Promise<void> {
    this.jobs.clear();
  }
}
