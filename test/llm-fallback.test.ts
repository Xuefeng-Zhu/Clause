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
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.parsedBy).toBe("offline-fixture");
    expect(res.problems).toEqual([]);
  }, 20_000);

  it("still surfaces the model error for quotes the offline path can't read", async () => {
    config.gemini.apiKey = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 })));
    await expect(parseContract({ kind: "text", text: "Some other quote" })).rejects.toThrow(/Gemini error 400/);
  });
});
