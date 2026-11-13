import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "../config.js";
import type { EvidenceKind, Milestone } from "../contract/schema.js";

export interface EvidenceFile {
  filename: string;
  mediaType: string; // image/jpeg, image/png, application/pdf
  base64: string;
  declaredKind: EvidenceKind; // what the uploader says it is
}

export const EvidenceVerdict = z.object({
  verdict: z.enum(["meets", "insufficient", "unclear"]),
  reasoning: z.string(), // shown to the owner next to the approve button
  observed: z.array(z.string()), // concrete things seen in the evidence
  missing: z.array(z.string()),
});
export type EvidenceVerdict = z.infer<typeof EvidenceVerdict>;

/**
 * Two layers:
 *  1. Code: are all required evidence KINDS present? If not, stop here; no model call.
 *  2. Claude: does the content actually show the release condition? (photos/PDF)
 * Either way the result is only a recommendation; the owner approves the release.
 */
export async function evaluateEvidence(milestone: Milestone, files: EvidenceFile[]): Promise<EvidenceVerdict> {
  const have = new Set(files.map((f) => f.declaredKind));
  const missingKinds = milestone.evidence_required.filter((k) => !have.has(k));
  if (missingKinds.length) {
    return {
      verdict: "insufficient",
      reasoning: `${milestone.clause.clause_id} requires ${milestone.evidence_required.join(" + ")}; missing ${missingKinds.join(", ")}.`,
      observed: [],
      missing: missingKinds,
    };
  }
  if (!config.anthropic.apiKey) return offlineVerdict(milestone, files);
  // Live vision only: a placeholder/empty file would 400 at the model API, so stop in code.
  const unreadable = files.find((f) => Buffer.from(f.base64 ?? "", "base64").length < 64);
  if (unreadable) {
    return {
      verdict: "insufficient",
      reasoning: `${unreadable.filename} is empty or unreadable, so it can't show ${milestone.clause.clause_id} was met.`,
      observed: [],
      missing: [milestone.release_condition],
    };
  }

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const blocks: Anthropic.ContentBlockParam[] = files.flatMap((f): Anthropic.ContentBlockParam[] => {
    const label: Anthropic.ContentBlockParam = { type: "text", text: `File: ${f.filename} (declared: ${f.declaredKind})` };
    if (f.mediaType === "application/pdf") {
      return [label, { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } }];
    }
    return [label, { type: "image", source: { type: "base64", media_type: f.mediaType as "image/jpeg" | "image/png", data: f.base64 } }];
  });
  blocks.push({
    type: "text",
    text: `Milestone ${milestone.id} "${milestone.name}". Release condition (${milestone.clause.clause_id}): "${milestone.clause.quote}". Does the evidence show this condition is met? Be skeptical: stock photos, a different room, unfinished work, or a report for a different address are "insufficient". If you can't tell, answer "unclear".`,
  });

  const msg = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1200,
    system: "You review construction progress evidence for a small-business owner. You recommend; the owner decides.",
    tools: [
      {
        name: "record_verdict",
        description: "Record the evidence verdict.",
        input_schema: z.toJSONSchema(EvidenceVerdict, { target: "draft-7" }) as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "record_verdict" },
    messages: [{ role: "user", content: blocks }],
  });
  const call = msg.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") throw new Error("No verdict returned.");
  return EvidenceVerdict.parse(call.input);
}

/** Offline demo: filenames containing "stock" or "wrong" fail; everything else passes. */
function offlineVerdict(milestone: Milestone, files: EvidenceFile[]): EvidenceVerdict {
  const bad = files.find((f) => /stock|wrong|blurry/i.test(f.filename));
  if (bad) {
    return {
      verdict: "insufficient",
      reasoning: `${bad.filename} doesn't show this job site (offline rule: filename flagged).`,
      observed: [],
      missing: [milestone.release_condition],
    };
  }
  return {
    verdict: "meets",
    reasoning: `Evidence covers ${milestone.evidence_required.join(" + ")} for ${milestone.clause.clause_id} (offline evaluator).`,
    observed: files.map((f) => `${f.declaredKind}: ${f.filename}`),
    missing: [],
  };
}
