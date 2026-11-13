import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../server/clause/config.js";
import { parseContract } from "../server/clause/contract/parser.js";

const quote = readFileSync(new URL("../samples/quote-maple-street-cafe.txt", import.meta.url), "utf8");

describe("model outage fallback", () => {
  const saved = config.gemini.apiKey;
  afterEach(() => {
    config.gemini.apiKey = saved;
    vi.unstubAllGlobals();
  });

  it("retries Gemini 503s, then falls back to the offline fixture for the bundled sample", async () => {
    config.gemini.apiKey = "test-key";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await parseContract({ kind: "text", text: quote });
    expect(fetchMock).toHaveBeenCalledTimes(2 + config.gemini.fallbackModels.length);
    expect(res.parsedBy).toBe("offline-fixture");
    expect(res.problems).toEqual([]);
  }, 20_000);

  it("walks the fallback Gemini models when the primary is overloaded", async () => {
    config.gemini.apiKey = "test-key";
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes(`/${config.gemini.fallbackModels[1]}:`)) {
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "x", args: { ok: true } } }] } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503 });
    }));
    const { callTool } = await import("../server/clause/llm.js");
    const out = await callTool({ system: "s", content: "c", toolName: "x", description: "d", schema: { type: "object" }, maxTokens: 10 });
    expect(out).toEqual({ ok: true });
    expect(urls[0]).toContain(config.gemini.model);
    expect(urls[2]).toContain(config.gemini.fallbackModels[0]);
    expect(urls[3]).toContain(config.gemini.fallbackModels[1]);
  }, 20_000);

  it("moves past a hanging model and falls back offline within the budget", async () => {
    config.gemini.apiKey = "test-key";
    process.env.GEMINI_ATTEMPT_TIMEOUT_MS = "50";
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
      init.signal?.addEventListener("abort", () => rej(new Error("The operation was aborted due to timeout")));
    })));
    const res = await parseContract({ kind: "text", text: quote });
    delete process.env.GEMINI_ATTEMPT_TIMEOUT_MS;
    expect(res.parsedBy).toBe("offline-fixture");
  }, 20_000);

  it("still surfaces the model error for quotes the offline path can't read", async () => {
    config.gemini.apiKey = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 })));
    await expect(parseContract({ kind: "text", text: "Some other quote" })).rejects.toThrow(/Gemini error 400/);
  });
});
