import { config, resolveMetalMode } from "../config.js";
import { MockMetalRail } from "./mock.js";
import { TestnetMetalRail } from "./testnet.js";
import type { MetalRail } from "./types.js";

export * from "./types.js";
export { MockMetalRail } from "./mock.js";
export { TestnetMetalRail, parseMetalCliOutput } from "./testnet.js";

export function createMetalRail(): MetalRail {
  return resolveMetalMode() === "testnet"
    ? new TestnetMetalRail({
        metalDir: config.metal.dir,
        cliPrefix: config.metal.cliPrefix,
        account: config.metal.account,
        rpcUrl: config.metal.rpcUrl,
      })
    : new MockMetalRail();
}
