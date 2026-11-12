import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "OWNER DECISION: reject the pending release or change order with a reason. Nothing on the card changes.",
  schema: z.object({ jobId: z.string(), reason: z.string().default("Rejected by owner") }),
  run: async ({ jobId, reason }) => ({ summary: summarize(await getService().rejectPending(jobId, reason)) }),
});
