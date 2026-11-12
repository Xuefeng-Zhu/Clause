import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, SAMPLES, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "Read a contractor quote or email thread and extract the payment terms (milestones, allowed spend, deadline, change-order clause), each with its verbatim clause. Creates a DRAFT job. Nothing is issued until the owner approves the terms. Pass useSample=true to load the bundled Maple Street Café quote.",
  schema: z.object({
    text: z.string().optional().describe("The quote or email thread as plain text"),
    useSample: z.boolean().optional().describe("Load the bundled sample quote (Q-2026-0412)"),
  }),
  run: async ({ text, useSample }) => {
    const source = useSample || !text ? SAMPLES.quote : text;
    const job = await getService().createJob({ kind: "text", text: source });
    return { summary: summarize(job), terms: job.terms, problems: job.problems, parsedBy: job.parsedBy };
  },
});
