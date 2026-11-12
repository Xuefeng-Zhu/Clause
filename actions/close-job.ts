import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "OWNER DECISION: close the job and permanently close its card on Airwallex.",
  schema: z.object({ jobId: z.string() }),
  run: async ({ jobId }) => ({ summary: summarize(await getService().closeJob(jobId)) }),
});
