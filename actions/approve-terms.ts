import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "OWNER APPROVAL: the owner confirms the extracted terms. Code then issues an Airwallex virtual card to the contractor whose controls are derived from the terms: limit = milestones released on signing, merchant-category allowlist from the allowed-spend clause, valid until the deadline. Only call this when the owner explicitly approves in the UI or says so in chat.",
  schema: z.object({ jobId: z.string() }),
  run: async ({ jobId }) => {
    const job = await (await getService()).approveTerms(jobId);
    return { summary: summarize(job), rules: job.rules };
  },
});
