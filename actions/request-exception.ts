import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, SAMPLES, summarize } from "../server/clause/app.js";

export default defineAction({
  description:
    "Evaluate an employee's client-entertainment note against policy §3.4, validate in code that the one-time cap never exceeds $125 × named attendees, and stage a PENDING manager exception. Card controls do not change until approve-exception runs.",
  schema: z.object({
    jobId: z.string().describe("Policy job id"),
    note: z
      .string()
      .optional()
      .describe("Employee explanation naming the client and attendees; defaults to bundled sample note when omitted or useSample=true"),
    useSample: z
      .boolean()
      .optional()
      .describe("Use the bundled Lone Star Logistics 4-attendee dinner note"),
    requestedCap: z
      .number()
      .positive()
      .optional()
      .describe("Optional requested one-time cap; deterministically clamped to 125 × attendees"),
  }),
  run: async ({ jobId, note, useSample, requestedCap }) => {
    const text = useSample || !note ? SAMPLES.exceptionNote : note;
    const job = await (await getService()).requestException(
      jobId,
      text,
      requestedCap !== undefined ? { requestedCap } : {},
    );
    return {
      summary: summarize(job),
      pending: job.pending ?? null,
      proposal: job.pending?.exception ?? null,
    };
  },
});
