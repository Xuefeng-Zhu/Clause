import { config } from "../config.js";
import { MockIssuingGateway } from "./mock.js";
import { SandboxIssuingGateway } from "./sandbox.js";
import type { IssuingGateway } from "./types.js";

export function createGateway(): IssuingGateway {
  return config.awx.mode === "sandbox" ? new SandboxIssuingGateway() : new MockIssuingGateway();
}

export * from "./types.js";
