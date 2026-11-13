import { resolveSecretDetailed } from "@agent-native/core/server";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";

export type AwxMode = "mock" | "sandbox";
export type MetalMode = "mock" | "testnet";

const envAwxClientId = process.env.AWX_CLIENT_ID || undefined; // guard:allow-no-env-credentials — optional local/sandbox deploy fallback
const envAwxApiKey = process.env.AWX_API_KEY || undefined; // guard:allow-no-env-credentials — optional local/sandbox deploy fallback
const envAwxCardholderId = process.env.AWX_CARDHOLDER_ID || undefined; // guard:allow-no-env-credentials — optional local/sandbox deploy fallback
const hasEnvAwx = Boolean(envAwxClientId && envAwxApiKey);

export const config = {
  awx: {
    mode: (hasEnvAwx ? "sandbox" : "mock") as AwxMode,
    clientId: hasEnvAwx ? envAwxClientId! : "mock_client_id",
    apiKey: hasEnvAwx ? envAwxApiKey! : "mock_api_key",
    baseUrl: "https://api.sandbox.airwallex.com",
    cardholderId: envAwxCardholderId as string | undefined,
  },
  metal: {
    get mode(): MetalMode {
      return resolveMetalMode();
    },
    get dir(): string {
      return process.env.METAL_DIR || "/workspace/work/metal"; // guard:allow-no-env-credentials — deploy-level directory outside repo
    },
    get cliPrefix(): string {
      return process.env.METAL_CLI_PREFIX || "/workspace/tools/metal"; // guard:allow-no-env-credentials — deploy-level CLI installation prefix
    },
    get account(): string | undefined {
      return process.env.METAL_ACCOUNT || undefined; // guard:allow-no-env-credentials — public principal account address on Metal testnet
    },
    get contractorAddress(): string | undefined {
      return process.env.METAL_CONTRACTOR_ADDRESS || undefined; // guard:allow-no-env-credentials — public contractor address on Metal testnet
    },
    get rpcUrl(): string | undefined {
      return process.env.METAL_RPC_URL || undefined; // guard:allow-no-env-credentials — deployment Metal testnet RPC endpoint
    },
  },
  anthropic: {
    apiKey: undefined as string | undefined,
    model: "claude-sonnet-4-5",
  },
  demo: {
    ownerEmail: "owner@example.com",
    contractorEmail: "contractor@example.com",
  },
};

export function resolveMetalMode(): MetalMode {
  const modeEnv = process.env.METAL_MODE; // guard:allow-no-env-credentials — deployment mode toggle
  const rpcUrl = process.env.METAL_RPC_URL; // guard:allow-no-env-credentials — deployment Metal testnet RPC endpoint
  const account = process.env.METAL_ACCOUNT; // guard:allow-no-env-credentials — public principal account address on Metal testnet
  return modeEnv === "testnet" && Boolean(rpcUrl && account) ? "testnet" : "mock";
}

async function readScopedSecret(key: string): Promise<string | undefined> {
  const res = await resolveSecretDetailed(key);
  if (res.lookupFailed) return undefined;
  return res.value || undefined;
}

/**
 * Refresh runtime credentials from Agent-Native's scoped secret store when running
 * inside a user/org request context. Falls back to env or offline/mock defaults otherwise.
 */
export async function syncScopedCredentials(): Promise<void> {
  if (!getRequestUserEmail()) return;

  try {
    const [awxClientId, awxApiKey, awxCardholderId, anthropicKey] =
      await Promise.all([
        readScopedSecret("AWX_CLIENT_ID"),
        readScopedSecret("AWX_API_KEY"),
        readScopedSecret("AWX_CARDHOLDER_ID"),
        readScopedSecret("ANTHROPIC_API_KEY"),
      ]);

    if (awxClientId && awxApiKey) {
      config.awx.mode = "sandbox";
      config.awx.clientId = awxClientId;
      config.awx.apiKey = awxApiKey;
      config.awx.cardholderId = awxCardholderId ?? envAwxCardholderId;
    } else if (hasEnvAwx) {
      config.awx.mode = "sandbox";
      config.awx.clientId = envAwxClientId!;
      config.awx.apiKey = envAwxApiKey!;
      config.awx.cardholderId = awxCardholderId ?? envAwxCardholderId;
    } else {
      config.awx.mode = "mock";
      config.awx.clientId = "mock_client_id";
      config.awx.apiKey = "mock_api_key";
      config.awx.cardholderId = awxCardholderId;
    }
    if (anthropicKey !== undefined) {
      config.anthropic.apiKey = anthropicKey;
    }
  } catch {
    // Outside a database-backed request (e.g. unit tests), keep current defaults.
  }
}

export function assertSandboxCredentials(): void {
  const { clientId, apiKey } = config.awx;
  if (!clientId || !apiKey || clientId.startsWith("mock_") || apiKey.startsWith("mock_")) {
    throw new Error(
      "Airwallex sandbox mode needs AWX_CLIENT_ID and AWX_API_KEY configured in Settings › Secrets.",
    );
  }
  if (!config.awx.baseUrl.includes("sandbox")) {
    throw new Error(`Refusing to run against non-sandbox base URL: ${config.awx.baseUrl}`);
  }
}
