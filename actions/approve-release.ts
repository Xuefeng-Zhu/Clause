import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "OWNER APPROVAL: release the pending milestone. The approval must match the pending one field for field (approval id, milestone, amount, currency, evidence hash) or it is rejected as stale. Code then raises the card's ALL_TIME limit to the new released total. Only call when the owner explicitly approves.",
  schema: z.object({
    jobId: z.string(),
    approvalId: z.string(),
    milestoneId: z.string(),
    amount: z.number(),
    currency: z.string().optional(),
    evidenceSha256: z.string().optional(),
  }),
  run: async ({ jobId, approvalId, milestoneId, amount, currency, evidenceSha256 }) => {
    const job = await (await getService()).approveRelease(jobId, {
      approval_id: approvalId,
      milestone_id: milestoneId,
      amount,
      ...(currency !== undefined ? { currency } : {}),
      ...(evidenceSha256 !== undefined ? { evidence_sha256: evidenceSha256 } : {}),
    });
    return { summary: summarize(job), rules: job.rules };
  },
});
