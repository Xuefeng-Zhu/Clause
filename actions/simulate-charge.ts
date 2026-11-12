import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { DEMO_CHARGES, getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description: "SANDBOX SIMULATION: pretend the contractor swipes the card at a merchant. Airwallex (or the mock) approves or declines it under the card controls; a decline comes back with a plain-English explanation that cites the contract clause. Use preset for the demo charges: lumber, lunch, home-depot, after-deadline.",
  schema: z.object({
    jobId: z.string(),
    preset: z.enum(["lumber", "lunch", "home-depot", "after-deadline"]).optional(),
    amount: z.number().positive().optional(),
    merchantName: z.string().optional(),
    mcc: z.string().regex(/^\d{4}$/).optional().describe("4-digit merchant category code"),
  }),
  run: async ({ jobId, preset, amount, merchantName, mcc }) => {
    const p = preset ? DEMO_CHARGES.find((c) => c.key === preset)! : undefined;
    const charge = p
      ? { amount: p.amount, merchant_name: p.merchant_name, mcc: p.mcc, ...("at" in p && p.at !== undefined ? { at: p.at } : {}) }
      : { amount: amount ?? 0, merchant_name: merchantName ?? "Custom merchant", mcc: mcc ?? "5211" };
    if (!charge.amount) throw new Error("Give a preset or an amount.");
    const svc = getService();
    const { txn, explanation } = await svc.simulateCharge(jobId, charge);
    return { approved: !explanation, txn, explanation: explanation ?? null, summary: summarize(await svc.getJob(jobId)) };
  },
});
