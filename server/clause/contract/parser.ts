import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config.js";
import { callTool, llmProvider, withOfflineFallback } from "../llm.js";
import { ContractTerms, validateTerms } from "./schema.js";
import { SAMPLE_TERMS } from "../fixtures.js";

export type ContractSource =
  | { kind: "text"; text: string } // pasted quote or email thread
  | { kind: "pdf"; base64: string; filename?: string };

export interface ParseResult {
  terms: ContractTerms;
  problems: string[]; // deterministic validation issues; non-empty blocks card issuance
  parsedBy: "gemini" | "claude" | "offline-fixture";
}

const SYSTEM = `You extract payment terms from a contractor quote or email thread for a small business.
Rules:
- Copy each clause_id exactly as written (e.g. "§2.1") and quote the clause text verbatim. Never paraphrase a quote.
- Milestone ids are "M1", "M2", "M3"... in document order.
- Amounts in major units as numbers (4,000.00 -> 4000).
- Dates as YYYY-MM-DD. "deadline.date" is the last day funds may be drawn.
- allowed_spend.categories: choose only from the enum. If the contract allows something not in the enum, add an open_question instead of guessing.
- Mark released_on_signing=true only when the text says the milestone is paid at signing / as a deposit.
- If anything is ambiguous (missing deadline, milestones that don't sum to the total, conflicting dates), record it in open_questions.
Return the result only through the record_contract_terms tool.`;

const TERMS_TOOL_SCHEMA = z.toJSONSchema(ContractTerms, { target: "draft-7" }) as Record<string, unknown>;

export async function parseContract(src: ContractSource): Promise<ParseResult> {
  if (!llmProvider()) {
    const terms = await parseOffline(src);
    return { terms, problems: validateTerms(terms), parsedBy: "offline-fixture" };
  }
  const { value: terms, usedFallback } = await withOfflineFallback(() => parseWithClaude(src), () => parseOffline(src));
  return { terms, problems: validateTerms(terms), parsedBy: usedFallback ? "offline-fixture" : llmProvider()! };
}

async function parseWithClaude(src: ContractSource): Promise<ContractTerms> {
  const content: Anthropic.MessageParam["content"] =
    src.kind === "pdf"
      ? [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: src.base64 } },
          { type: "text", text: "Extract the contract terms from this quote." },
        ]
      : [{ type: "text", text: `Extract the contract terms from this quote / thread:\n\n<document>\n${src.text}\n</document>` }];

  const callInput = await callTool({
    system: SYSTEM,
    content: content,
    toolName: "record_contract_terms",
    description: "Record the extracted contract terms.",
    schema: TERMS_TOOL_SCHEMA as Record<string, unknown>,
    maxTokens: 4096,
  });
  const terms = ContractTerms.parse(callInput);
  assertQuotesAreVerbatim(terms, src);
  return terms;
}

/** Guardrail: every quoted clause must actually appear in the source text (whitespace-normalised). */
export function assertQuotesAreVerbatim(terms: ContractTerms, src: ContractSource): void {
  if (src.kind !== "text") return; // PDF text isn't available locally; the human review step covers it
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const hay = norm(src.text);
  const clauses = [
    ...terms.milestones.map((m) => m.clause),
    terms.allowed_spend.clause,
    terms.deadline.clause,
    ...(terms.prohibited_spend ? [terms.prohibited_spend.clause] : []),
  ];
  const missing = clauses.filter((c) => !hay.includes(norm(c.quote).slice(0, 40)));
  if (missing.length) {
    terms.open_questions.push(...missing.map((c) => `Quote for ${c.clause_id} not found verbatim in source; please review.`));
  }
}

/** No API key: return the hand-checked fixture for the bundled sample so the demo runs offline. */
async function parseOffline(src: ContractSource): Promise<ContractTerms> {
  const text = src.kind === "text" ? src.text : "";
  if (!text.includes("Q-2026-0412")) {
    throw new Error("Offline mode only understands samples/quote-maple-street-cafe.txt. Set GEMINI_API_KEY to parse other quotes.");
  }
  return ContractTerms.parse(structuredClone(SAMPLE_TERMS));
}
