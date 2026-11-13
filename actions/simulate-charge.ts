import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { ALL_DEMO_CHARGES, getService, summarize } from "../server/clause/app.js";

export default defineAction({
  description:
    "SANDBOX SIMULATION: simulate a card swipe at a merchant. Airwallex (or the mock) approves or declines under live card controls; declines cite the exact contract or policy § clause. Contract presets: lumber, lunch, home-depot, after-deadline. Policy presets: hotel, uber, bar, bestbuy, dinner, late.",
  schema: z.object({
    jobId: z.string(),
    preset: z
      .enum([
        "lumber",
        "lunch",
        "home-depot",
        "after-deadline",
        "hotel",
        "uber",
        "bar",
        "bestbuy",
        "dinner",
        "late",
      ])
      .optional(),
    amount: z.number().positive().optional(),
    merchantName: z.string().optional(),
    mcc: z.string().regex(/^\d{4}$/).optional().describe("4-digit merchant category code"),
  }),
  run: async ({ jobId, preset, amount, merchantName, mcc }) => {
    const p = preset ? ALL_DEMO_CHARGES.find((c) => c.key === preset)! : undefined;
    const charge = p
      ? { amount: p.amount, merchant_name: p.merchant_name, mcc: p.mcc, ...("at" in p && p.at !== undefined ? { at: p.at } : {}) }
      : { amount: amount ?? 0, merchant_name: merchantName ?? "Custom merchant", mcc: mcc ?? "5211" };
    if (!charge.amount) throw new Error("Give a preset or an amount.");
    const svc = await getService();
    const { txn, explanation } = await svc.simulateCharge(jobId, charge);
    return { approved: !explanation, txn, explanation: explanation ?? null, summary: summarize(await svc.getJob(jobId)) };
  },
});
