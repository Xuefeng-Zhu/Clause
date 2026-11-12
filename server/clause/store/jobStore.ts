import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
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
}

/** Tiny JSON-file store. Good enough for a demo; swap for SQLite if needed. */
export class JobStore {
  private jobs = new Map<string, Job>();
  constructor(private readonly path?: string) {
    if (path && existsSync(path)) {
      for (const j of JSON.parse(readFileSync(path, "utf8")) as Job[]) this.jobs.set(j.id, j);
    }
  }
  get(id: string): Job {
    const j = this.jobs.get(id);
    if (!j) throw new Error(`Job ${id} not found`);
    return j;
  }
  list(): Job[] {
    return [...this.jobs.values()];
  }
  save(job: Job): Job {
    this.jobs.set(job.id, job);
    if (this.path) {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(this.list(), null, 2));
    }
    return job;
  }
  reset(): void {
    this.jobs.clear();
    if (this.path) writeFileSync(this.path, "[]");
  }
}
