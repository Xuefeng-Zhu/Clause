import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description:
    "SANDBOX SIMULATION: attempt an early Metal milestone payout at 2× the contract mandate's per-payment cap. The on-chain (or mock) Metal mandate deterministically refuses with mandate_cap_exceeded and cites the governing contract clause.",
  schema: z.object({
    jobId: z.string().describe("Active contract job id"),
  }),
  run: async ({ jobId }) => {
    const svc = await getService();
    const { job, result, clause, headline, event } = await svc.metalOverpayAttempt(jobId);
    return {
      outcome: result.outcome,
      reason: result.reason ?? null,
      clause,
      headline,
      event,
      summary: summarize(job),
    };
  },
});
