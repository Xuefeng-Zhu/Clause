import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, SAMPLES, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "Read a contractor email against the current terms and draft a change order (new milestone amounts and/or deadline, with the verbatim source sentence). Creates a PENDING change-order approval; the card does not change until the owner approves. useSample=true loads the bundled quartz-substitution email.",
  schema: z.object({ jobId: z.string(), emailText: z.string().optional(), useSample: z.boolean().optional() }),
  run: async ({ jobId, emailText, useSample }) => {
    const job = await getService().proposeChangeOrder(jobId, useSample || !emailText ? SAMPLES.changeOrderEmail : emailText);
    return { summary: summarize(job), pending: job.pending };
  },
});
