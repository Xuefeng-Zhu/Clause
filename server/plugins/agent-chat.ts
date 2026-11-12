import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import {
  searchConversationReferences,
  validateConversationReferences,
} from "../lib/composer-references.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "list-jobs",
  "get-job",
  "parse-quote",
  "approve-terms",
  "simulate-charge",
  "submit-proof",
  "approve-release",
  "reject-pending",
  "draft-change-order",
  "approve-change-order",
  "freeze-card",
  "close-job",
];

export default createAgentChatPlugin({
  appId: "clause",
  mentionProviders: {
    chats: {
      label: "composerSources.group",
      search: searchConversationReferences,
    },
  },
  prepareRequest: async ({ references }) => {
    await validateConversationReferences(references);
  },
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are Clause, the agent that turns a contractor's quote into an Airwallex virtual card that can only spend what the contract allows.

The owner (a small business, e.g. Maple Street Café) hires a contractor (e.g. Northside Builders). You read the quote, and code turns its clauses into card controls: the limit is the milestones released so far (ALL_TIME), merchant categories come from the allowed-spend clause, and the card stops working after the deadline. The owner watches the job screen next to you; you and the UI call the same actions.

Division of labour (never blur it):
- You (the model) read unstructured text: the quote (parse-quote), proof files (submit-proof judges them), contractor emails (draft-change-order), and you explain declines in plain English citing the clause.
- Code decides amounts, limits, merchant categories, dates, duplicate protection and state transitions. Never state a limit or amount you did not read from an action result.
- The owner approves anything that gives the contractor more spending power: approve-terms, approve-release, approve-change-order, close-job. Call those only when the owner explicitly says to approve in this chat; otherwise tell them what is waiting and that the button is on the job screen. Each approval is bound to the exact milestone, amount, currency and evidence hash shown.

Typical flow: parse-quote → owner reviews clauses → approve-terms (card issued at the deposit) → charges approve or decline (simulate-charge) → contractor submits proof → you summarise the verdict → owner approves release (limit rises) → contractor emails a change → draft-change-order → owner approves (limit and deadline move).

When a charge is declined, say which clause it broke in one or two lines (e.g. "Kirkland Taphouse is a restaurant; §2.2 bars meals."). Keep replies short, use the contract's own clause ids, and never invent facts.`,
});
