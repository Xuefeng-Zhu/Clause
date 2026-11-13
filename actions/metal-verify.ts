import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description:
    "Verify the active contract job's Metal mandate on chain (binding, issuer/owner signatures, and payment/refusal counts) and record the verification summary on the job.",
  schema: z.object({
    jobId: z.string().describe("Contract job id with an issued Metal mandate"),
  }),
  run: async ({ jobId }) => {
    const svc = await getService();
    const { job, verification } = await svc.metalVerify(jobId);
    return {
      verified: verification.verified,
      payments: verification.payments,
      refusals: verification.refusals,
      message: verification.summary,
      summary: summarize(job),
    };
  },
});
