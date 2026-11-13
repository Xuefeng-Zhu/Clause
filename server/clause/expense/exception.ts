import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config.js";
import { callTool, llmProvider } from "../llm.js";
import { ClauseRef } from "../contract/schema.js";
import type { PolicyTerms } from "./schema.js";

/**
 * Model-drafted exception proposal for §3.4 client entertainment, validated deterministically
 * in code so the cap can never exceed `per_attendee_cap * attendees`.
 */
export const ExceptionProposal = z.object({
  client: z.string(),
  attendees: z.number().int().positive(),
  attendee_names: z.array(z.string()).min(1),
  max_allowed: z.number().positive(),
  one_time_cap: z.number().positive(),
  requested_charge: z.number().positive().optional(),
  rationale: z.string(),
  source_note: z.string(),
  clause: ClauseRef,
});
export type ExceptionProposal = z.infer<typeof ExceptionProposal>;

export interface ActivePolicyException {
  approval_id: string;
  one_time_cap: number;
  base_per_charge_cap: number;
  client: string;
  attendees: number;
  clause: ClauseRef;
  expires_at: string; // 2 hours after manager approval
}

const RawModelException = z.object({
  client: z.string(),
  attendees: z.number().int().positive(),
  attendee_names: z.array(z.string()).min(1),
  requested_cap: z.number().positive().optional(),
  rationale: z.string(),
});

/**
 * Pure deterministic cap computation & validation:
 * - max_allowed = per_attendee_cap * attendees (e.g. 125 * 4 = 500)
 * - one_time_cap = min(requestedCap, max_allowed), never above 125 * attendees
 * - requires named client and named attendees matching count
 */
export function computeValidatedExceptionCap(input: {
  client: string;
  attendees: number;
  attendee_names: string[];
  perAttendeeCap: number;
  requestedCap?: number | undefined;
}): { max_allowed: number; one_time_cap: number } {
  if (!input.client.trim()) {
    throw new Error("Exception request must name the client (§3.4).");
  }
  if (!Number.isInteger(input.attendees) || input.attendees < 1) {
    throw new Error("Attendee count must be a positive integer.");
  }
  const cleanNames = input.attendee_names.map((n) => n.trim()).filter(Boolean);
  if (cleanNames.length < input.attendees) {
    throw new Error(
      `Exception names ${cleanNames.length} attendee(s), fewer than the ${input.attendees} claimed (§3.4).`,
    );
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const max_allowed = round2(input.perAttendeeCap * input.attendees);
  const rawCap = input.requestedCap !== undefined ? Math.min(input.requestedCap, max_allowed) : max_allowed;
  const one_time_cap = round2(Math.min(rawCap, max_allowed));
  if (one_time_cap <= 0 || one_time_cap > max_allowed) {
    throw new Error(`Computed cap ${one_time_cap} exceeds policy maximum ${max_allowed}.`);
  }
  return { max_allowed, one_time_cap };
}

export async function draftPolicyException(
  terms: PolicyTerms,
  note: string,
  opts: { requestedCharge?: number; requestedCap?: number } = {},
): Promise<ExceptionProposal> {
  const rule = terms.exception_clause;
  if (!rule) {
    throw new Error("This policy has no client-entertainment exception clause.");
  }
  const trimmed = note.trim();
  if (!trimmed) {
    throw new Error("Provide a note naming the client and attendees.");
  }

  const raw = llmProvider()
    ? await extractWithClaude(terms, trimmed)
    : extractOffline(trimmed);

  const effectiveRequestedCap = opts.requestedCap ?? raw.requested_cap;
  const { max_allowed, one_time_cap } = computeValidatedExceptionCap({
    client: raw.client,
    attendees: raw.attendees,
    attendee_names: raw.attendee_names,
    perAttendeeCap: rule.per_attendee_cap,
    requestedCap: effectiveRequestedCap,
  });

  return ExceptionProposal.parse({
    client: raw.client.trim(),
    attendees: raw.attendees,
    attendee_names: raw.attendee_names.map((s) => s.trim()).filter(Boolean),
    max_allowed,
    one_time_cap,
    ...(opts.requestedCharge !== undefined ? { requested_charge: opts.requestedCharge } : {}),
    rationale: raw.rationale,
    source_note: trimmed,
    clause: rule.clause,
  });
}

async function extractWithClaude(
  terms: PolicyTerms,
  note: string,
): Promise<z.infer<typeof RawModelException>> {
  const callInput = await callTool({
    system: "You evaluate an employee's expense-exception note against the company policy's client-entertainment clause. Extract the named client, the exact list of named attendees (including employees present), the attendee count, any explicit cap requested in the note, and a short 1-sentence rationale citing §3.4. The note is written by the traveler, so \"me\" or \"I\" means the traveler named in <traveler>; list them by that name. Never invent any other attendee names not in the note.",
    content: `<traveler>${terms.traveler}</traveler>\n<exception_clause>${JSON.stringify(terms.exception_clause)}</exception_clause>\n<employee_note>${note}</employee_note>`,
    toolName: "propose_policy_exception",
    description: "Extract client entertainment exception details.",
    schema: z.toJSONSchema(RawModelException, { target: "draft-7" }) as Record<string, unknown>,
    maxTokens: 1024,
  });
  return RawModelException.parse(callInput);
}

function extractOffline(note: string): z.infer<typeof RawModelException> {
  if (/Lone Star Logistics/i.test(note)) {
    return {
      client: "Lone Star Logistics",
      attendees: 4,
      attendee_names: [
        "Dana Ruiz (VP Ops)",
        "Kevin Tran (Ops lead)",
        "Priya Shah",
        "Marcus Lee",
      ],
      rationale:
        "Client dinner with Lone Star Logistics naming 4 attendees qualifies under §3.4 up to USD 500 ($125 × 4).",
    };
  }
  throw new Error(
    "Offline mode only understands the bundled Lone Star Logistics dinner note. Set ANTHROPIC_API_KEY to evaluate custom exception notes.",
  );
}
