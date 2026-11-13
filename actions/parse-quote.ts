import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, SAMPLES, summarize } from "../server/clause/app.js";

export default defineAction({
  description:
    "Read a contractor quote OR a corporate travel & expense policy + approved trip request, extracting structured terms with verbatim § clause quotes. Creates a DRAFT job; nothing is issued until owner/manager approval. Pass useSample=true (and optional sampleKind='policy') for bundled samples.",
  schema: z.object({
    text: z.string().optional().describe("The contractor quote or travel policy + trip request as plain text"),
    useSample: z.boolean().optional().describe("Load a bundled sample document"),
    sampleKind: z
      .enum(["contract", "policy"])
      .optional()
      .describe('Bundled sample to load when useSample=true: "contract" (Q-2026-0412) or "policy" (TR-2611); defaults to "contract"'),
  }),
  run: async ({ text, useSample, sampleKind }) => {
    const fallbackSample = sampleKind === "policy" ? SAMPLES.policy : SAMPLES.quote;
    const source = useSample || !text ? fallbackSample : text;
    const job = await (await getService()).createJob({ kind: "text", text: source });
    return {
      summary: summarize(job),
      kind: job.kind ?? "contract",
      terms: job.terms,
      policyTerms: job.policyTerms ?? null,
      problems: job.problems,
      parsedBy: job.parsedBy,
    };
  },
});
