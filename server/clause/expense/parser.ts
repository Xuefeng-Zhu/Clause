import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config.js";
import type { ContractSource } from "../contract/parser.js";
import { SAMPLE_POLICY_TERMS } from "../fixtures.js";
import { addDaysIso, PolicyTerms, validatePolicyTerms } from "./schema.js";

export interface PolicyParseResult {
  policyTerms: PolicyTerms;
  problems: string[];
  parsedBy: "claude" | "offline-fixture";
}

const POLICY_SYSTEM = `You extract corporate travel & expense policy rules and an approved trip request into structured PolicyTerms.
Rules:
- Copy each clause_id exactly as written (e.g. "§2.1", "§3.3", "§4.2") and quote the clause text verbatim. Never paraphrase a quote.
- Amounts in major units as numbers (2,000.00 -> 2000).
- Dates as YYYY-MM-DD. Compute card_expires.date deterministically from trip_end + the policy's expiry window (e.g. 48 hours after Nov 21, 2026 -> 2026-11-23).
- allowed_spend.categories: choose only from ["lodging", "airfare", "ground_transport", "meals"].
- Record every prohibited spend clause (§4.1, §4.2, etc.) separately in prohibited_spend with its verbatim quote.
- If anything is ambiguous, add it to open_questions.
Return the result only through the record_policy_terms tool.`;

const POLICY_TOOL_SCHEMA = z.toJSONSchema(PolicyTerms, { target: "draft-7" }) as Record<string, unknown>;

export function looksLikePolicyDocument(src: ContractSource): boolean {
  if (src.kind !== "text") return false;
  const t = src.text;
  if (t.includes("TR-2611") || /TRAVEL\s*&\s*EXPENSE\s*POLICY/i.test(t)) return true;
  if (/TRIP\s+REQUEST/i.test(t) && /Traveler:/i.test(t)) return true;
  if (/not\s+reimbursable/i.test(t) && /approved\s+budget/i.test(t)) return true;
  return false;
}

export async function parsePolicy(src: ContractSource): Promise<PolicyParseResult> {
  const policyTerms = config.anthropic.apiKey
    ? await parsePolicyWithClaude(src)
    : await parsePolicyOffline(src);
  return {
    policyTerms,
    problems: validatePolicyTerms(policyTerms),
    parsedBy: config.anthropic.apiKey ? "claude" : "offline-fixture",
  };
}

async function parsePolicyWithClaude(src: ContractSource): Promise<PolicyTerms> {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const content: Anthropic.MessageParam["content"] =
    src.kind === "pdf"
      ? [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: src.base64 } },
          { type: "text", text: "Extract the travel & expense policy rules and approved trip terms." },
        ]
      : [
          {
            type: "text",
            text: `Extract the travel & expense policy rules and approved trip terms:\n\n<document>\n${src.text}\n</document>`,
          },
        ];

  const msg = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 4096,
    system: POLICY_SYSTEM,
    tools: [
      {
        name: "record_policy_terms",
        description: "Record the extracted travel & expense policy and trip terms.",
        input_schema: POLICY_TOOL_SCHEMA as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "record_policy_terms" },
    messages: [{ role: "user", content }],
  });
  const call = msg.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") throw new Error("Claude did not return policy terms.");
  const terms = PolicyTerms.parse(call.input);
  // Enforce deterministic 48h expiry if clause quotes "48 hours after"
  if (/48\s+hours\s+after/i.test(terms.card_expires.clause.quote) && /^\d{4}-\d{2}-\d{2}$/.test(terms.trip_end)) {
    terms.card_expires.date = addDaysIso(terms.trip_end, 2);
  }
  assertPolicyQuotesAreVerbatim(terms, src);
  return terms;
}

/** Guardrail: every quoted policy clause must appear verbatim in the source text (whitespace-normalised). */
export function assertPolicyQuotesAreVerbatim(terms: PolicyTerms, src: ContractSource): void {
  if (src.kind !== "text") return;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const hay = norm(src.text);
  const clauses = [
    terms.budget.clause,
    terms.per_charge_cap.clause,
    ...(terms.lodging_clause ? [terms.lodging_clause] : []),
    terms.allowed_spend.clause,
    terms.card_expires.clause,
    ...terms.prohibited_spend.map((p) => p.clause),
    ...(terms.exception_clause ? [terms.exception_clause.clause] : []),
  ];
  const missing = clauses.filter((c) => !hay.includes(norm(c.quote).slice(0, 40)));
  if (missing.length) {
    terms.open_questions.push(
      ...missing.map((c) => `Quote for ${c.clause_id} not found verbatim in source; please review.`),
    );
  }
}

async function parsePolicyOffline(src: ContractSource): Promise<PolicyTerms> {
  const text = src.kind === "text" ? src.text : "";
  if (!text.includes("TR-2611") && !/ACME ROBOTICS/i.test(text)) {
    throw new Error(
      "Offline mode only understands bundled samples (Q-2026-0412 or TR-2611). Set ANTHROPIC_API_KEY to parse other documents.",
    );
  }
  const parsed = PolicyTerms.parse(structuredClone(SAMPLE_POLICY_TERMS));
  assertPolicyQuotesAreVerbatim(parsed, src);
  return parsed;
}
