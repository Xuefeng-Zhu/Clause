import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config.js";
import { callTool, llmProvider } from "../llm.js";
import type { ContractTerms } from "./schema.js";

/** A proposed change the agent drafts from an email. It only takes effect after owner approval. */
export const ChangeOrderProposal = z.object({
  summary: z.string(),
  milestone_amount_changes: z.array(
    z.object({ milestone_id: z.string(), new_amount: z.number().positive(), reason: z.string() }),
  ),
  new_deadline: z.string().optional(), // YYYY-MM-DD
  requires_signed_change_order: z.boolean(),
  source_quote: z.string(), // verbatim sentence(s) from the email
});
export type ChangeOrderProposal = z.infer<typeof ChangeOrderProposal>;

export async function draftChangeOrder(terms: ContractTerms, emailText: string): Promise<ChangeOrderProposal> {
  if (!llmProvider()) return offlineDraft(emailText);
  const callInput = await callTool({
    system: "You compare a contractor email against the current contract terms and draft a change-order proposal. Quote the email verbatim in source_quote. Never invent amounts or dates that are not in the email. requires_signed_change_order is true whenever price, scope or schedule changes.",
    content: `<terms>${JSON.stringify(terms)}</terms>\n<email>${emailText}</email>`,
    toolName: "propose_change_order",
    description: "Draft the change order.",
    schema: z.toJSONSchema(ChangeOrderProposal, { target: "draft-7" }) as Record<string, unknown>,
    maxTokens: 1500,
  });
  return ChangeOrderProposal.parse(callInput);
}

/** Apply an APPROVED change order to the terms. Pure function; caller re-derives the card plan. */
export function applyChangeOrder(terms: ContractTerms, co: ChangeOrderProposal): ContractTerms {
  const next: ContractTerms = structuredClone(terms);
  for (const ch of co.milestone_amount_changes) {
    const m = next.milestones.find((x) => x.id === ch.milestone_id);
    if (!m) throw new Error(`Change order references unknown milestone ${ch.milestone_id}`);
    m.amount = ch.new_amount;
  }
  next.total_amount = next.milestones.reduce((s, m) => s + m.amount, 0);
  if (co.new_deadline) {
    next.deadline = { date: co.new_deadline, clause: { clause_id: "Change order", quote: co.source_quote } };
  }
  return next;
}

function offlineDraft(emailText: string): ChangeOrderProposal {
  if (!emailText.includes("Q-2026-0412")) throw new Error("Offline mode only understands samples/change-order-email.txt.");
  return {
    summary: "In-stock quartz substitution adds $800 to Milestone 2; completion moves from Dec 18 to Dec 23, 2026.",
    milestone_amount_changes: [
      { milestone_id: "M2", new_amount: 5800, reason: "Backordered quartz replaced with in-stock quartz (+$800)." },
    ],
    new_deadline: "2026-12-23",
    requires_signed_change_order: true,
    source_quote:
      "We can do the in-stock quartz at +$800 for Milestone 2, but installation slips a week, so we'd need until December 23 to finish.",
  };
}
