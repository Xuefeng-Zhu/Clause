
export type AwxMode = "mock" | "sandbox";

export const config = {
  awx: {
    mode: (process.env.AWX_MODE ?? "mock") as AwxMode,
    clientId: process.env.AWX_CLIENT_ID ?? "mock_client_id",
    apiKey: process.env.AWX_API_KEY ?? "mock_api_key",
    baseUrl: process.env.AWX_BASE_URL ?? "https://api.sandbox.airwallex.com",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || undefined,
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
  },
  port: Number(process.env.PORT ?? 3000),
  demo: {
    ownerEmail: process.env.DEMO_OWNER_EMAIL ?? "owner@example.com",
    contractorEmail: process.env.DEMO_CONTRACTOR_EMAIL ?? "contractor@example.com",
  },
};

export function assertSandboxCredentials(): void {
  const { clientId, apiKey } = config.awx;
  if (!clientId || !apiKey || clientId.startsWith("mock_") || apiKey.startsWith("mock_")) {
    throw new Error(
      "AWX_MODE=sandbox needs real sandbox credentials in AWX_CLIENT_ID / AWX_API_KEY (.env, never committed).",
    );
  }
  if (!config.awx.baseUrl.includes("sandbox")) {
    throw new Error(`Refusing to run against non-sandbox base URL: ${config.awx.baseUrl}`);
  }
}
