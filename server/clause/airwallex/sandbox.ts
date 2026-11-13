import { config } from "../config.js";
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
 *   POST /simulation/issuing/card_transaction_lifecycles/{lifecycle_id}/capture
 *   GET  /issuing/transactions?card_id=
 *
 * Verified live against the sandbox on 2026-11-12:
 *  - REST DELEGATE cardholder: { type, email } only, returns READY (HTTP 202).
 *  - cards/create needs program: { purpose: "COMMERCIAL" } (no type on this account).
 *  - authorization_controls round-trip as sent; partial updates keep other fields.
 *  - simulation body: card_id, transaction_amount, transaction_currency,
 *    merchant_category_code, merchant_info (string). Response has process_result
 *    APPROVED|DECLINED, failure_reason, card_transaction_lifecycle_id.
 *  - card_status INACTIVE declines with CARD_INACTIVE; CLOSED closes.
 */
export class SandboxIssuingGateway implements IssuingGateway {
  readonly mode = "sandbox" as const;
  constructor(private readonly awx = new AirwallexClient()) {}

  async createDelegateCardholder(email: string): Promise<Cardholder> {
    const preset = config.awx.cardholderId;
    if (preset) return { cardholder_id: preset, email, type: "DELEGATE", status: "READY" };
    try {
      const res = await this.awx.post<any>("/issuing/cardholders/create", { type: "DELEGATE", email });
      return { cardholder_id: res.cardholder_id ?? res.id, email, type: "DELEGATE", status: res.status };
    } catch (err) {
      // Re-running the demo reuses the same cardholder email; Airwallex rejects duplicates,
      // so look up and reuse the existing cardholder instead of failing.
      if (!/already associated with a cardholder/i.test(String(err))) throw err;
      const existing = await this.findCardholderByEmail(email);
      if (!existing) throw err;
      return existing;
    }
  }

  private async findCardholderByEmail(email: string): Promise<Cardholder | undefined> {
    for (let page = 0; page < 20; page++) {
      const res = await this.awx.get<any>(`/issuing/cardholders?page_num=${page}&page_size=100`);
      const items: any[] = res.items ?? [];
      const hit = items.find((c) => (c.email ?? "").toLowerCase() === email.toLowerCase());
      if (hit) return { cardholder_id: hit.cardholder_id ?? hit.id, email, type: "DELEGATE", status: hit.status };
      if (!res.has_more || items.length === 0) return undefined;
    }
    return undefined;
  }

  async createCard(input: { cardholder_id: string; nick_name: string; authorization_controls: AuthorizationControls }): Promise<Card> {
    const payload = {
      cardholder_id: input.cardholder_id,
      created_by: "Contract-as-Card agent",
      form_factor: "VIRTUAL",
      is_personalized: false,
      program: { purpose: "COMMERCIAL" },
      nick_name: input.nick_name,
      authorization_controls: input.authorization_controls,
    };
    try {
      return normalizeCard(await this.awx.post<any>("/issuing/cards/create", payload));
    } catch (err) {
      const limits = input.authorization_controls.transaction_limits?.limits;
      if (limits && limits.length > 1) {
        console.warn("[Airwallex sandbox] Multiple transaction_limits rejected on createCard; falling back to first limit:", err);
        const fallbackControls: AuthorizationControls = {
          ...input.authorization_controls,
          transaction_limits: {
            currency: input.authorization_controls.transaction_limits!.currency,
            limits: [limits[0]!],
          },
        };
        return normalizeCard(
          await this.awx.post<any>("/issuing/cards/create", {
            ...payload,
            authorization_controls: fallbackControls,
          }),
        );
      }
      throw err;
    }
  }

  async getCard(card_id: string): Promise<Card> {
    return normalizeCard(await this.awx.get<any>(`/issuing/cards/${card_id}`));
  }

  async updateCard(card_id: string, patch: { card_status?: CardStatus; authorization_controls?: AuthorizationControls }): Promise<Card> {
    try {
      const res = await this.awx.post<any>(`/issuing/cards/${card_id}/update`, patch as Record<string, unknown>, { withRequestId: false });
      return normalizeCard(res);
    } catch (err) {
      const limits = patch.authorization_controls?.transaction_limits?.limits;
      if (limits && limits.length > 1) {
        console.warn("[Airwallex sandbox] Multiple transaction_limits rejected on updateCard; falling back to first limit:", err);
        const fallbackPatch = {
          ...patch,
          authorization_controls: {
            ...patch.authorization_controls,
            transaction_limits: {
              currency: patch.authorization_controls!.transaction_limits!.currency,
              limits: [limits[0]!],
            },
          },
        };
        const res = await this.awx.post<any>(`/issuing/cards/${card_id}/update`, fallbackPatch as Record<string, unknown>, { withRequestId: false });
        return normalizeCard(res);
      }
      throw err;
    }
  }

  async simulateAuthorization(req: SimulatedAuthRequest): Promise<IssuingTransaction> {
    // The sandbox authorizes against its own clock and ignores a simulated time.
    // To demo a swipe "after the deadline" for real, briefly move the card's active_to
    // into the past (so Airwallex itself returns OUT_OF_ALLOWED_TIME_RANGE), then restore it.
    const at = req.at ? Date.parse(req.at) : NaN;
    if (!Number.isNaN(at) && at > Date.now()) {
      const card = await this.getCard(req.card_id);
      const original = card.authorization_controls;
      if (original.active_to && at > Date.parse(original.active_to)) {
        const past = new Date(Date.now() - 60_000).toISOString();
        const pastFrom = new Date(Date.now() - 120_000).toISOString();
        await this.updateCard(req.card_id, {
          authorization_controls: { ...original, active_from: pastFrom, active_to: past },
        });
        try {
          const { at: _ignored, ...rest } = req;
          return await this.simulateNow(rest);
        } finally {
          await this.updateCard(req.card_id, { authorization_controls: original }).catch(() => undefined);
        }
      }
    }
    return this.simulateNow(req);
  }

  private async simulateNow(req: SimulatedAuthRequest): Promise<IssuingTransaction> {
    const res = await this.awx.post<any>("/simulation/issuing/create", {
      card_id: req.card_id,
      transaction_amount: req.amount,
      transaction_currency: req.currency,
      merchant_category_code: req.merchant_category_code,
      merchant_info: req.merchant_name,
    });
    const txn = normalizeTxn(res, req);
    if (!txn.failure_reason && res.process_result !== "DECLINED" && res.card_transaction_lifecycle_id) {
      await this.awx
        .post(`/simulation/issuing/card_transaction_lifecycles/${res.card_transaction_lifecycle_id}/capture`, {})
        .then(() => { txn.transaction_type = "CLEARING"; })
        .catch(() => undefined);
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
  const failureReason = r.failure_reason;
  return {
    transaction_id: r.transaction_id ?? r.card_transaction_id ?? r.card_transaction_data?.card_transaction_id ?? r.id,
    card_id: r.card_id ?? req?.card_id,
    amount: Math.abs(Number(r.transaction_amount ?? r.amount ?? req?.amount)),
    currency: r.transaction_currency ?? r.currency ?? req?.currency,
    merchant_name: (r.merchant?.name ? String(r.merchant.name).replace(/_+$/, "") : undefined) ?? r.merchant_info?.name ?? req?.merchant_name ?? "",
    merchant_category_code: r.merchant?.category_code ?? r.merchant_info?.category_code ?? req?.merchant_category_code ?? "",
    transaction_type: r.transaction_type ?? "AUTHORIZATION",
    status: r.status ?? (r.process_result === "DECLINED" ? "FAILED" : r.process_result === "APPROVED" ? "APPROVED" : undefined),
    ...(failureReason ? { failure_reason: failureReason } : {}),
    created_at: r.transaction_date ?? r.created_at ?? new Date().toISOString(),
  };
}
