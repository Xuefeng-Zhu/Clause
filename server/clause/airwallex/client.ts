import { randomUUID } from "node:crypto";
import { config, assertSandboxCredentials } from "../config.js";

/**
 * Thin REST client for the Airwallex sandbox.
 * - POST /api/v1/authentication/login with x-client-id + x-api-key headers, no body
 * - bearer token lasts ~30 min; we refresh at 25 min
 * - amounts are MAJOR units
 * - request_id = fresh UUID per operation; reuse ONLY on retry of the same operation
 */
export class AirwallexClient {
  private token: string | undefined;
  private tokenExpiresAt = 0;

  constructor(
    private readonly baseUrl = config.awx.baseUrl,
    private readonly clientId = config.awx.clientId,
    private readonly apiKey = config.awx.apiKey,
  ) {}

  async login(): Promise<string> {
    assertSandboxCredentials();
    const res = await fetch(`${this.baseUrl}/api/v1/authentication/login`, {
      method: "POST",
      headers: { "x-client-id": this.clientId, "x-api-key": this.apiKey },
    });
    if (!res.ok) throw new AirwallexError(res.status, await safeJson(res), "authentication/login");
    const body = (await res.json()) as { token: string };
    this.token = body.token;
    this.tokenExpiresAt = Date.now() + 25 * 60 * 1000;
    return body.token;
  }

  private async authHeader(): Promise<Record<string, string>> {
    if (!this.token || Date.now() >= this.tokenExpiresAt) await this.login();
    return { Authorization: `Bearer ${this.token}` };
  }

  async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    const qs = query ? `?${new URLSearchParams(query)}` : "";
    return this.send<T>("GET", `${path}${qs}`);
  }

  /** POST with automatic request_id (pass one explicitly to retry the same op). */
  async post<T>(path: string, body: Record<string, unknown> = {}, opts: { requestId?: string; withRequestId?: boolean } = {}): Promise<T> {
    const payload = opts.withRequestId === false ? body : { request_id: opts.requestId ?? randomUUID(), ...body };
    return this.send<T>("POST", path, payload);
  }

  private async send<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", ...(await this.authHeader()) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // Sandbox rate limits: 20 rps global, 10/endpoint. Back off on 429 (same request_id = safe retry).
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return this.send<T>(method, path, body, attempt + 1);
    }
    if (res.status === 401 && attempt === 0) {
      this.token = undefined;
      return this.send<T>(method, path, body, attempt + 1);
    }
    if (!res.ok) throw new AirwallexError(res.status, await safeJson(res), path);
    return (await res.json()) as T;
  }
}

export class AirwallexError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly path: string,
  ) {
    super(`Airwallex ${status} on ${path}: ${JSON.stringify(body)}`);
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return await res.text().catch(() => "");
  }
}
