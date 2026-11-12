import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, runtimeInfo, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "List every contract job with its card status, released/spent amounts and any pending approval. Also reports whether Airwallex runs in sandbox or mock mode.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const jobs = await getService().listJobs();
    return { runtime: runtimeInfo(), jobs: jobs.map(summarize) };
  },
});
