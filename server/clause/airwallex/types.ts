// Shapes we use from the Airwallex Issuing API (sandbox).
// Field names follow the Airwallex API reference + airwallexdev.com/guide.
// authorization_controls field names verified live against the Airwallex sandbox on 2026-11-12.
// (https://mcp.sandbox.airwallex.com/docs) before the first sandbox run. Everything that
// touches the wire is built in policy/cardRules.ts -> toCardControlsPayload(), so a field
// rename is a one-line fix.

export type LimitInterval = "PER_TRANSACTION" | "DAILY" | "WEEKLY" | "MONTHLY" | "ALL_TIME";

export interface TransactionLimit {
  amount: number; // MAJOR units (100 = $100), never cents
  interval: LimitInterval;
}

export interface AuthorizationControls {
  allowed_currencies?: string[];
  allowed_merchant_categories?: string[]; // 4-digit MCC strings
  allowed_transaction_count?: "SINGLE" | "MULTIPLE";
  transaction_limits?: { currency: string; limits: TransactionLimit[] };
  active_from?: string; // ISO-8601
  active_to?: string; // ISO-8601
}

export type CardStatus = "PENDING" | "ACTIVE" | "INACTIVE" | "CLOSED";

export interface Cardholder {
  cardholder_id: string;
  email: string;
  type: "DELEGATE" | "INDIVIDUAL";
  status: string;
}

export interface Card {
  card_id: string;
  cardholder_id: string;
  card_status: CardStatus;
  nick_name?: string;
  authorization_controls: AuthorizationControls;
}

export type DeclineReason =
  | "INSUFFICIENT_FUNDS"
  | "LIMIT_EXCEEDED"
  | "CURRENCY_NOT_ALLOWED"
  | "MERCHANT_CATEGORY_NOT_ALLOWED"
  | "OUT_OF_ALLOWED_TIME_RANGE"
  | "CARD_INACTIVE"
  | "CARD_CLOSED";

export interface SimulatedAuthRequest {
  card_id: string;
  amount: number;
  currency: string;
  merchant_name: string;
  merchant_category_code: string;
  /** Mock only: pretend "now" is this time, so the demo can show a post-deadline charge. */
  at?: string;
}

export interface IssuingTransaction {
  transaction_id: string;
  card_id: string;
  amount: number;
  currency: string;
  merchant_name: string;
  merchant_category_code: string;
  /** Per guide: treat CLEARING as accepted; FAILED + failure_reason as a decline. */
  transaction_type: "AUTHORIZATION" | "CLEARING" | "REVERSAL" | "REFUND";
  status: "PENDING" | "APPROVED" | "CLEARED" | "FAILED";
  failure_reason?: DeclineReason;
  created_at: string;
}

/** Everything the app needs from Airwallex. Mock and sandbox both implement it. */
export interface IssuingGateway {
  readonly mode: "mock" | "sandbox";
  createDelegateCardholder(email: string): Promise<Cardholder>;
  createCard(input: {
    cardholder_id: string;
    nick_name: string;
    authorization_controls: AuthorizationControls;
  }): Promise<Card>;
  getCard(card_id: string): Promise<Card>;
  updateCard(
    card_id: string,
    patch: { card_status?: CardStatus; authorization_controls?: AuthorizationControls },
  ): Promise<Card>;
  /** Sandbox-only simulation, kept behind this interface per the builder guide. */
  simulateAuthorization(req: SimulatedAuthRequest): Promise<IssuingTransaction>;
  listTransactions(card_id: string): Promise<IssuingTransaction[]>;
}
