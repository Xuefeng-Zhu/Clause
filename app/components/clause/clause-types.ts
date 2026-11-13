import type { DeclaredProofKind } from "@/lib/clause-samples";

export interface ClauseRef {
  clause_id: string;
  quote: string;
}

export interface Milestone {
  id: string;
  name: string;
  amount: number;
  release_condition: string;
  evidence_required: string[];
  released_on_signing: boolean;
  clause: ClauseRef;
}

export interface ContractTerms {
  contract_ref: string;
  contractor_name: string;
  client_name: string;
  project: string;
  currency: string;
  total_amount: number;
  milestones: Milestone[];
  allowed_spend: {
    categories: string[];
    clause: ClauseRef;
  };
  prohibited_spend?: {
    description: string;
    clause: ClauseRef;
  };
  start_date?: string;
  deadline: {
    date: string;
    clause: ClauseRef;
  };
  change_order_clause?: ClauseRef;
  open_questions: string[];
}

export interface CardRule {
  control: "limit" | "merchant_categories" | "time_window" | "currency";
  description: string;
  value: string;
  clause: ClauseRef;
  declines: string[];
}

export interface DeclineExplanation {
  transaction_id: string;
  failure_reason: string;
  headline: string;
  clause_id?: string;
  clause_quote?: string;
  prohibited?: boolean;
}

export interface ClauseTransaction {
  transaction_id: string;
  card_id: string;
  amount: number;
  currency: string;
  merchant_name: string;
  merchant_category_code: string;
  transaction_type: "AUTHORIZATION" | "CLEARING" | "REVERSAL" | "REFUND";
  status: "PENDING" | "APPROVED" | "CLEARED" | "FAILED";
  failure_reason?: string;
  created_at: string;
  explanation?: DeclineExplanation;
}

export interface EvidenceVerdict {
  verdict: "meets" | "insufficient" | "unclear";
  reasoning: string;
  observed: string[];
  missing: string[];
}

export interface ChangeOrderProposal {
  summary: string;
  milestone_amount_changes: Array<{
    milestone_id: string;
    new_amount: number;
    reason: string;
  }>;
  new_deadline?: string;
  requires_signed_change_order: boolean;
  source_quote: string;
}

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

export interface ClauseJob {
  id: string;
  status: "draft" | "active" | "closed";
  terms: ContractTerms;
  problems: string[];
  parsedBy: string;
  cardholder_id?: string;
  card_id?: string;
  releasedMilestoneIds: string[];
  rules: CardRule[];
  pending?: PendingApproval;
  transactions: ClauseTransaction[];
  events: JobEvent[];
  created_at?: string;
}

export interface JobSummary {
  id: string;
  status: "draft" | "active" | "closed";
  contractRef: string;
  contractor: string;
  client: string;
  project: string;
  currency: string;
  total: number;
  released: number;
  spent: number;
  available: number;
  deadline: string;
  cardId: string | null;
  nextMilestone: {
    id: string;
    name: string;
    amount: number;
    evidenceRequired: string[];
    clauseId: string;
  } | null;
  pending: PendingApproval | null;
  problems: string[];
  parsedBy: string;
  mccNames?: Record<string, string>;
}

export interface RuntimeInfo {
  airwallexMode: "mock" | "sandbox" | string;
  airwallexBaseUrl: string;
  model: string;
}

export interface UploadableProofFile {
  filename: string;
  mediaType: "image/jpeg" | "image/png" | "application/pdf";
  base64: string;
  declaredKind: DeclaredProofKind;
}
