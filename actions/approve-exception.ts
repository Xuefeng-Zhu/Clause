import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description:
    "MANAGER APPROVAL: approve the pending §3.4 client-entertainment exception. Code raises the Airwallex card's PER_TRANSACTION limit to the validated one-time cap and automatically restores the base per-charge cap right after the next approved charge (or 2 hours). Only call when the manager/owner explicitly approves.",
  schema: z.object({
    jobId: z.string().describe("Policy job id"),
    approvalId: z.string().describe("Pending approval_id for the policy_exception"),
  }),
  run: async ({ jobId, approvalId }) => {
    const job = await (await getService()).approveException(jobId, approvalId);
    return {
      summary: summarize(job),
      rules: job.rules,
      activeException: job.activeException ?? null,
    };
  },
});
