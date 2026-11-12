import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "OWNER APPROVAL: apply the pending change order. Code re-derives the terms and updates the card controls (limit and valid-until date) on Airwallex. Only call when the owner explicitly approves.",
  schema: z.object({ jobId: z.string(), approvalId: z.string() }),
  run: async ({ jobId, approvalId }) => {
    const job = await (await getService()).approveChangeOrder(jobId, approvalId);
    return { summary: summarize(job), rules: job.rules };
  },
});
