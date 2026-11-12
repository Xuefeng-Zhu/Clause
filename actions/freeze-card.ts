import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "Freeze (frozen=true) or unfreeze the job's card on Airwallex. Use when the owner asks to pause spending, or when something looks wrong and the owner agrees.",
  schema: z.object({ jobId: z.string(), frozen: z.boolean() }),
  run: async ({ jobId, frozen }) => ({ summary: summarize(await getService().freeze(jobId, frozen)) }),
});
