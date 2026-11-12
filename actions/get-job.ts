import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "Read one contract job in full: extracted terms with verbatim clauses, the card rules derived from them, the pending approval (if any), every simulated card transaction with its decline explanation, and the event log.",
  schema: z.object({ jobId: z.string().describe("Job id, e.g. job_1a2b3c4d") }),
  http: { method: "GET" },
  run: async ({ jobId }) => {
    const job = await (await getService()).getJob(jobId);
    return { summary: summarize(job), job };
  },
});
