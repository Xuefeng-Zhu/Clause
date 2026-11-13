import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

/**
 * One structured "tool call" to whichever model is configured.
 * Gemini (GEMINI_API_KEY) is preferred; Anthropic (ANTHROPIC_API_KEY) is the fallback.
 * Callers pass Anthropic-style content blocks; they are translated for Gemini.
 * The model only fills a schema; every limit is still decided in code by the caller.
 */
export type LlmProvider = "gemini" | "claude";

export function llmProvider(): LlmProvider | undefined {
  if (config.gemini.apiKey) return "gemini";
  if (config.anthropic.apiKey) return "claude";
  return undefined;
}

export function llmModelLabel(): string {
  const p = llmProvider();
  if (p === "gemini") return config.gemini.model;
  if (p === "claude") return config.anthropic.model;
  return "offline fixtures (no GEMINI_API_KEY / ANTHROPIC_API_KEY)";
}

export interface ToolCallRequest {
  system: string;
  content: string | Anthropic.ContentBlockParam[];
  toolName: string;
  description: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}

export async function callTool(req: ToolCallRequest): Promise<unknown> {
  const p = llmProvider();
  if (p === "gemini") return callGemini(req);
  if (p === "claude") return callClaude(req);
  throw new Error("No model configured. Set GEMINI_API_KEY (or ANTHROPIC_API_KEY).");
}

async function callClaude(req: ToolCallRequest): Promise<unknown> {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const msg = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: req.maxTokens,
    system: req.system,
    tools: [{ name: req.toolName, description: req.description, input_schema: req.schema as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: req.toolName },
    messages: [{ role: "user", content: req.content }],
  });
  const call = msg.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") throw new Error(`Model did not call ${req.toolName}.`);
  return call.input;
}

/** Strip JSON-schema keys Gemini's function declarations reject. */
function cleanSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(cleanSchema);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (k === "$schema" || k === "$id" || k === "additionalProperties") continue;
    out[k] = cleanSchema(v);
  }
  return out;
}

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

function toGeminiParts(content: ToolCallRequest["content"]): GeminiPart[] {
  if (typeof content === "string") return [{ text: content }];
  return content.flatMap((b): GeminiPart[] => {
    if (b.type === "text") return [{ text: b.text }];
    if ((b.type === "image" || b.type === "document") && b.source.type === "base64") {
      return [{ inline_data: { mime_type: b.source.media_type, data: b.source.data } }];
    }
    return [];
  });
}

async function callGemini(req: ToolCallRequest): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`;
  const body = {
    system_instruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: toGeminiParts(req.content) }],
    tools: [
      {
        function_declarations: [
          { name: req.toolName, description: req.description, parametersJsonSchema: cleanSchema(req.schema) },
        ],
      },
    ],
    tool_config: { function_calling_config: { mode: "ANY", allowed_function_names: [req.toolName] } },
    generationConfig: {
      maxOutputTokens: Math.max(req.maxTokens, 2048) * 4,
      temperature: 0,
      // Extraction into a fixed schema needs little reasoning; keep latency demo-friendly.
      thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING || "low" },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": config.gemini.apiKey! },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { functionCall?: { name: string; args: unknown } }[] } }[];
  };
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${json.error?.message ?? "unknown"}`);
  const call = json.candidates?.[0]?.content?.parts?.find((p) => p.functionCall)?.functionCall;
  if (!call) throw new Error(`Gemini did not call ${req.toolName}.`);
  return call.args;
}
