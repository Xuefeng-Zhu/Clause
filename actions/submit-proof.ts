import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getService, summarize } from "../server/clause/app.js";

const File = z.object({
  filename: z.string(),
  mediaType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  base64: z.string().describe("File bytes, base64"),
  declaredKind: z.enum(["photos", "inspection_report", "invoice", "walkthrough_signoff"]),
});

export default defineAction({
  description: "The contractor submits proof for the next milestone. Code checks that every required evidence kind is present; the model then judges whether the files actually show the release condition. The result is a PENDING release approval bound to the milestone, amount, currency and evidence hash. It does not raise the card limit.",
  schema: z.object({ jobId: z.string(), files: z.array(File).min(1) }),
  run: async ({ jobId, files }) => {
    const job = await getService().submitProof(jobId, files);
    return { summary: summarize(job), pending: job.pending };
  },
});
