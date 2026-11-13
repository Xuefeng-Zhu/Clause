# Clause — Agent Guide

Clause turns a contractor's quote into an Airwallex virtual card whose spending cap, merchant-category allowlist, and expiration cutoff are derived deterministically from the contract's clauses. `/` redirects through sign-in to `/home` (the **Contract Jobs** workspace), while full-screen chat lives at `/chat` and `/chat/<threadId>` and the contextual `AgentInspector` sidebar runs alongside `/home`.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`.

## Core rules

- **Strict model / code / owner boundary:**
  - Model reads unstructured inputs (`parse-quote`, `submit-proof`, `draft-change-order`) and explains declines citing contract `clause_id`s.
  - Deterministic code (`server/clause/policy/cardRules.ts`, `server/clause/milestones/service.ts`) computes all dollar limits, MCC allowlists, `active_to` deadlines, evidence SHA-256 bindings, and decline explanations. Never invent amounts or limits not returned by an action.
  - Owner approvals (`approve-terms`, `approve-release`, `approve-change-order`, `close-job`) grant or terminate spending power. Only invoke them from chat when the owner explicitly instructs approval in the conversation.
- **UI responsiveness:** Acknowledge user actions within 100 ms (never > 400 ms), reject overlapping mutations on the active slot, and allow client-side cancellation to free the slot.
- **Data & credentials:** All jobs live in PostgreSQL/PGlite table `cl_jobs` (`server/db/schema.ts`), scoped per authenticated user via `owner_email` in `SqlJobStore` (`server/clause/store/sqlJobStore.ts`). Optional external keys (`AWX_CLIENT_ID`, `AWX_API_KEY`, `AWX_CARDHOLDER_ID`, `ANTHROPIC_API_KEY`) are registered in `server/plugins/secrets.ts` and resolved per-request via `resolveSecretDetailed` in `server/clause/config.ts` — never read user credentials from `process.env`.
- **Branding:** Keep `server/plugins/agent-native-email-branding.ts` aligned (`app.name: "Clause"`, `app.homePath: "/home"`).

## Actions

Both the UI (`useActionQuery` / `useActionMutation` in `app/components/clause/ClauseJobWorkspace.tsx`) and the Clause agent (`server/plugins/agent-chat.ts`) share these actions:

| Action | HTTP | Args | Purpose |
| --- | --- | --- | --- |
| `list-jobs` | `GET` | `{}` | List current user's contract jobs (`summarize`) + Airwallex/model runtime info |
| `get-job` | `GET` | `{ jobId }` | Read full `Job` document (terms, verbatim clauses, derived `CardRule[]`, pending approval, transactions, events) |
| `parse-quote` | `POST` | `{ text?, useSample?, sampleKind? }` | Extract `ContractTerms` or `PolicyTerms` + deterministic validation problems; creates a `draft` job |
| `approve-terms` | `POST` | `{ jobId }` | Owner/manager approval: issue Airwallex virtual card at signing-milestone (`M1`) `ALL_TIME` limit or policy trip budget + per-charge cap |
| `simulate-charge` | `POST` | `{ jobId, preset?, amount?, merchantName?, mcc? }` | Simulate card swipe (contract or policy presets, or custom) and return clause-cited `DeclineExplanation` |
| `submit-proof` | `POST` | `{ jobId, files }` | Check required evidence kinds in code, evaluate files, and stage a SHA-256-bound `release_milestone` pending approval |
| `approve-release` | `POST` | `{ jobId, approvalId, milestoneId, amount, currency?, evidenceSha256? }` | Owner approval: verify exact field-for-field match against pending release and raise card `ALL_TIME` limit |
| `draft-change-order` | `POST` | `{ jobId, emailText?, useSample? }` | Draft a `ChangeOrderProposal` from contractor email and stage a `change_order` pending approval |
| `approve-change-order` | `POST` | `{ jobId, approvalId }` | Owner approval: apply change order to terms and re-derive Airwallex card limit and `active_to` |
| `request-exception` | `POST` | `{ jobId, note?, useSample?, requestedCap? }` | Evaluate employee §3.4 entertainment note, clamp cap to `$125 × attendees`, and stage `policy_exception` pending approval |
| `approve-exception` | `POST` | `{ jobId, approvalId }` | Manager approval: raise `PER_TRANSACTION` limit for one charge (or 2h), automatically restoring base cap after next approved swipe |
| `metal-overpay-attempt` | `POST` | `{ jobId }` | Sandbox simulation: attempt an early Metal milestone payout at 2× cap -> refused `mandate_cap_exceeded` citing contract clause |
| `metal-wrong-payee` | `POST` | `{ jobId }` | Sandbox simulation: attempt a Metal payout to an unlisted address -> refused `mandate_payee_not_listed` citing contract clause |
| `metal-verify` | `POST` | `{ jobId }` | Verify the job's Metal mandate on chain and report payment/refusal counts |
| `reject-pending` | `POST` | `{ jobId, reason? }` | Reject the current pending milestone release, change order, or policy exception without modifying card controls |
| `freeze-card` | `POST` | `{ jobId, frozen }` | Toggle Airwallex card between `INACTIVE` (frozen) and `ACTIVE` |
| `close-job` | `POST` | `{ jobId }` | Permanently close the Airwallex virtual card (`CLOSED`) and mark job `closed` |
| `reset-demo` | `POST` | `{}` | Delete the current user's demo jobs and reset the in-memory mock gateway |
| `view-screen` | `false` | `{}` | Return `navigation`, `runtime`, `activeJob` summary + recent transactions for `<current-screen>` |
| `navigate` | `false` | `{ view, path?, threadId? }` | Navigate current browser tab (`home` / `jobs` -> `/home`, `chat` -> `/chat`) |

## Application state & UI selectors

- `navigation` tracks `{ view, path, publicPath, jobId?, threadId? }` via `app/hooks/use-navigation-state.ts`; selected job is synced to `/home?job=<jobId>`.
- Stable DOM hooks on `/home` (`app/components/clause/ClauseJobWorkspace.tsx`): `#parse`, `#approveTerms`, `[data-charge]`, `#proofFiles`, `#proofKind`, `#submitProof`, `#draftCo`, `#approveRelease`, `#approveCo`, `#requestException`, `#approveException`, `#expenseReport`, `#exportReport`, `#metalPanel`, `#metalSpent`, `#metalEvents`, `#metalOverpay`, `#metalWrongPayee`, `#metalVerify`, `#resetDemo`.

## Verification

Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm agent-native:doctor` — fix all findings before finishing.
