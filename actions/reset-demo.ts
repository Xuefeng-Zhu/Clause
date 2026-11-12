import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { resetRuntime } from "../server/clause/app.js";

export default defineAction({
  description: "Delete every job so the demo can start over. Cards already issued in the Airwallex sandbox are left as they are.",
  schema: z.object({}),
  run: async () => {
    await resetRuntime();
    return { ok: true };
  },
});
