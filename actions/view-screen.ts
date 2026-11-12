import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

import { getService, runtimeInfo, summarize } from "../server/clause/app.js";

export default defineAction({
  description:
    "Read Clause's current screen state, including navigation, runtime mode, job summaries, and the currently selected job. Basic context is already included in <current-screen>; call this when you need a fresh read.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState("navigation")) as
      | { view?: string; path?: string; jobId?: string }
      | null;
    if (!getRequestUserEmail()) {
      return {
        ...(navigation ? { navigation } : {}),
        runtime: runtimeInfo(),
        jobCount: 0,
        activeJob: null,
        jobs: [],
      };
    }

    const jobs = await (await getService()).listJobs();
    const summaries = jobs.map(summarize);
    const selectedId = navigation?.jobId ?? summaries[0]?.id;
    const activeJob = selectedId ? jobs.find((j) => j.id === selectedId) : jobs[0];

    return {
      ...(navigation ? { navigation } : {}),
      runtime: runtimeInfo(),
      jobCount: summaries.length,
      activeJob: activeJob
        ? {
            summary: summarize(activeJob),
            recentTransactions: activeJob.transactions.slice(-5),
          }
        : null,
      jobs: summaries,
    };
  },
});
