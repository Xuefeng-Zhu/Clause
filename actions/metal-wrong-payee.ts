import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description:
    "SANDBOX SIMULATION: attempt a Metal *USDZ payout to an unauthorized payee address not listed in the contract mandate. The Metal mandate deterministically refuses with mandate_payee_not_listed and cites the governing contract clause.",
  schema: z.object({
    jobId: z.string().describe("Active contract job id"),
  }),
  run: async ({ jobId }) => {
    const svc = await getService();
    const { job, result, clause, headline, attemptedPayee, event } =
      await svc.metalWrongPayeeAttempt(jobId);
    return {
      outcome: result.outcome,
      reason: result.reason ?? null,
      attemptedPayee,
      clause,
      headline,
      event,
      summary: summarize(job),
    };
  },
});
