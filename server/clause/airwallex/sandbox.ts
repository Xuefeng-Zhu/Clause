import { AirwallexClient } from "./client.js";
import type {
  AuthorizationControls,
  Card,
  CardStatus,
  Cardholder,
  IssuingGateway,
  IssuingTransaction,
  SimulatedAuthRequest,
} from "./types.js";

/**
 * Real Airwallex sandbox implementation.
 * Endpoints (prefix /api/v1, base https://api.sandbox.airwallex.com):
 *   POST /issuing/cardholders/create
 *   POST /issuing/cards/create
 *   GET  /issuing/cards/{id}
 *   POST /issuing/cards/{id}/update       (controls, freeze = INACTIVE, close = CLOSED)
 *   POST /simulation/issuing/create       (sandbox-only authorization)
 *   POST /simulation/issuing/{txn}/capture
 *   GET  /issuing/transactions
 *
 * TODO(verify on first sandbox run, via docs MCP):
 *  - REST cardholder create: DELEGATE needs only email on MCP; REST may want more fields.
 *    If REST rejects, create the DELEGATE cardholder once via the developer MCP and set
 *    AWX_CARDHOLDER_ID in .env (createDelegateCardholder() honors it).
 *  - simulation/issuing/create body: card_id vs card_number, merchant field names.
 */
export class SandboxIssuingGateway implements IssuingGateway {
  readonly mode = "sandbox" as const;
  constructor(private readonly awx = new AirwallexClient()) {}

  async createDelegateCardholder(email: string): Promise<Cardholder> {
    const preset = process.env.AWX_CARDHOLDER_ID;
    if (preset) return { cardholder_id: preset, email, type: "DELEGATE", status: "READY" };
    const res = await this.awx.post<any>("/issuing/cardholders/create", { type: "DELEGATE", email });
    return { cardholder_id: res.cardholder_id ?? res.id, email, type: "DELEGATE", status: res.status };
  }

  async createCard(input: { cardholder_id: string; nick_name: string; authorization_controls: AuthorizationControls }): Promise<Card> {
    const res = await this.awx.post<any>("/issuing/cards/create", {
      cardholder_id: input.cardholder_id,
      created_by: "Contract-as-Card agent",
      form_factor: "VIRTUAL",
      is_personalized: false,
      nick_name: input.nick_name,
      authorization_controls: input.authorization_controls,
    });
    return normalizeCard(res);
  }

  async getCard(card_id: string): Promise<Card> {
    return normalizeCard(await this.awx.get<any>(`/issuing/cards/${card_id}`));
  }

  async updateCard(card_id: string, patch: { card_status?: CardStatus; authorization_controls?: AuthorizationControls }): Promise<Card> {
    const res = await this.awx.post<any>(`/issuing/cards/${card_id}/update`, patch as Record<string, unknown>, { withRequestId: false });
    return normalizeCard(res);
  }

  async simulateAuthorization(req: SimulatedAuthRequest): Promise<IssuingTransaction> {
    const res = await this.awx.post<any>("/simulation/issuing/create", {
      card_id: req.card_id,
      transaction_amount: req.amount,
      transaction_currency: req.currency,
      merchant_info: { name: req.merchant_name, category_code: req.merchant_category_code },
    });
    const txn = normalizeTxn(res, req);
    if (!txn.failure_reason) {
      await this.awx.post(`/simulation/issuing/${txn.transaction_id}/capture`, {}).catch(() => undefined);
      txn.transaction_type = "CLEARING";
    }
    return txn;
  }

  async listTransactions(card_id: string): Promise<IssuingTransaction[]> {
    const res = await this.awx.get<any>("/issuing/transactions", { card_id });
    return (res.items ?? []).map((t: any) => normalizeTxn(t));
  }
}

function normalizeCard(r: any): Card {
  return {
    card_id: r.card_id ?? r.id,
    cardholder_id: r.cardholder_id,
    card_status: r.card_status,
    nick_name: r.nick_name,
    authorization_controls: r.authorization_controls ?? {},
  };
}

function normalizeTxn(r: any, req?: SimulatedAuthRequest): IssuingTransaction {
  return {
    transaction_id: r.transaction_id ?? r.id,
    card_id: r.card_id ?? req?.card_id,
    amount: Number(r.transaction_amount ?? r.amount ?? req?.amount),
    currency: r.transaction_currency ?? r.currency ?? req?.currency,
    merchant_name: r.merchant?.name ?? r.merchant_info?.name ?? req?.merchant_name ?? "",
    merchant_category_code: r.merchant?.category_code ?? r.merchant_info?.category_code ?? req?.merchant_category_code ?? "",
    transaction_type: r.transaction_type ?? "AUTHORIZATION",
    status: r.status,
    failure_reason: r.failure_reason || undefined,
    created_at: r.transaction_date ?? r.created_at ?? new Date().toISOString(),
  };
}
