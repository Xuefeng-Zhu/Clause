import { randomUUID } from "node:crypto";
import type {
  AuthorizationControls,
  Card,
  CardStatus,
  Cardholder,
  DeclineReason,
  IssuingGateway,
  IssuingTransaction,
  SimulatedAuthRequest,
} from "./types.js";

/**
 * Offline stand-in for the Airwallex sandbox. It enforces the same card controls in the
 * same order with the same decline codes, so the full demo runs with no keys.
 * Swap to the real sandbox with AWX_MODE=sandbox. Decision logic never knows which it has.
 */
export class MockIssuingGateway implements IssuingGateway {
  readonly mode = "mock" as const;
  private cards = new Map<string, Card>();
  private txns: IssuingTransaction[] = [];
  constructor(public walletBalance = 25_000) {}

  async createDelegateCardholder(email: string): Promise<Cardholder> {
    return { cardholder_id: `ch_mock_${randomUUID().slice(0, 8)}`, email, type: "DELEGATE", status: "READY" };
  }

  async createCard(input: { cardholder_id: string; nick_name: string; authorization_controls: AuthorizationControls }): Promise<Card> {
    const card: Card = {
      card_id: `card_mock_${randomUUID().slice(0, 8)}`,
      cardholder_id: input.cardholder_id,
      card_status: "ACTIVE", // virtual cards activate automatically
      nick_name: input.nick_name,
      authorization_controls: structuredClone(input.authorization_controls),
    };
    this.cards.set(card.card_id, card);
    return structuredClone(card);
  }

  async getCard(card_id: string): Promise<Card> {
    const c = this.cards.get(card_id);
    if (!c) throw new Error(`mock: card ${card_id} not found`);
    return structuredClone(c);
  }

  async updateCard(card_id: string, patch: { card_status?: CardStatus; authorization_controls?: AuthorizationControls }): Promise<Card> {
    const c = this.cards.get(card_id);
    if (!c) throw new Error(`mock: card ${card_id} not found`);
    if (patch.card_status) c.card_status = patch.card_status;
    if (patch.authorization_controls) c.authorization_controls = { ...c.authorization_controls, ...structuredClone(patch.authorization_controls) };
    return structuredClone(c);
  }

  async simulateAuthorization(req: SimulatedAuthRequest): Promise<IssuingTransaction> {
    const card = this.cards.get(req.card_id);
    const reason = card ? this.check(card, req) : "CARD_CLOSED";
    const txn: IssuingTransaction = {
      transaction_id: `txn_mock_${randomUUID().slice(0, 8)}`,
      card_id: req.card_id,
      amount: req.amount,
      currency: req.currency,
      merchant_name: req.merchant_name,
      merchant_category_code: req.merchant_category_code,
      transaction_type: reason ? "AUTHORIZATION" : "CLEARING",
      status: reason ? "FAILED" : "APPROVED",
      failure_reason: reason,
      created_at: req.at ?? new Date().toISOString(),
    };
    if (!reason) this.walletBalance -= req.amount;
    this.txns.push(txn);
    return structuredClone(txn);
  }

  async listTransactions(card_id: string): Promise<IssuingTransaction[]> {
    return this.txns.filter((t) => t.card_id === card_id).map((t) => structuredClone(t));
  }

  private check(card: Card, req: SimulatedAuthRequest): DeclineReason | undefined {
    if (card.card_status === "CLOSED") return "CARD_CLOSED";
    if (card.card_status !== "ACTIVE") return "CARD_INACTIVE";
    const ac = card.authorization_controls;
    const now = new Date(req.at ?? Date.now()).getTime();
    if ((ac.active_from && now < Date.parse(ac.active_from)) || (ac.active_to && now > Date.parse(ac.active_to))) {
      return "OUT_OF_ALLOWED_TIME_RANGE";
    }
    if (ac.allowed_currencies?.length && !ac.allowed_currencies.includes(req.currency)) return "CURRENCY_NOT_ALLOWED";
    if (ac.allowed_merchant_categories?.length && !ac.allowed_merchant_categories.includes(req.merchant_category_code)) {
      return "MERCHANT_CATEGORY_NOT_ALLOWED";
    }
    const limits = ac.transaction_limits?.limits ?? [];
    const spent = this.txns
      .filter((t) => t.card_id === card.card_id && t.transaction_type === "CLEARING")
      .reduce((s, t) => s + t.amount, 0);
    for (const l of limits) {
      if (l.interval === "PER_TRANSACTION" && req.amount > l.amount) return "LIMIT_EXCEEDED"; // inclusive
      if (l.interval === "ALL_TIME" && spent + req.amount > l.amount) return "LIMIT_EXCEEDED";
    }
    if (req.amount > this.walletBalance) return "INSUFFICIENT_FUNDS";
    return undefined;
  }
}
