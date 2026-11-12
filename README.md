# Clause — Contract-as-Card on Agent-Native

**Escrow without the escrow.** Clause reads a contractor quote, extracts its payment milestones and spending rules with verbatim clause citations, and turns them into deterministic controls on a dedicated Airwallex virtual card.

- **Cumulative milestone cap (`ALL_TIME`):** Card spending starts at the signing deposit (`M1`) and rises only when progress proof passes review and the owner approves a bound release.
- **Merchant allowlist (`allowed_merchant_categories`):** Mapped in code from the contract's allowed-spend clause (`§2.1`) to 4-digit MCCs; restaurants, travel, and fuel decline automatically.
- **Schedule enforcement (`active_to`):** Derived from the substantial-completion deadline (`§3.2`), updated only after an approved change order (`§4.1`).
- **Clause-cited declines:** Every declined authorization maps its Airwallex `failure_reason` back to the exact contract clause that set the rule.
- **Agent + UI parity:** Built on `@agent-native/core` — the Contract Jobs workspace (`/home`) and the Clause agent (`/chat` and the right-hand `AgentInspector`) share the exact same typed actions, SQL job store (`cl_jobs`), and `<current-screen>` context.

## Quick start

```bash
pnpm install
pnpm test                  # Vitest suite: schema, card plan, declines, bound approvals, 9-step flow
pnpm typecheck             # Full TypeScript + React Router + action registry check
pnpm agent-native:doctor   # Framework security, scoping, and credential guards
pnpm dev                   # App + Clause agent at http://localhost:8080
```

Out of the box, Clause runs with **zero external keys**:
- **Airwallex Issuing:** Uses `MockIssuingGateway` (`server/clause/airwallex/mock.ts`), enforcing the same `ALL_TIME` limits, MCC allowlists, time windows, and decline codes (`MERCHANT_CATEGORY_NOT_ALLOWED`, `LIMIT_EXCEEDED`, `OUT_OF_ALLOWED_TIME_RANGE`, `CARD_INACTIVE`, `CARD_CLOSED`) as the Airwallex sandbox.
- **Contract / Evidence / Change-Order AI:** Uses deterministic offline fixtures (`server/clause/fixtures.ts`) for the bundled Maple Street Café quote (`Q-2026-0412`) and quartz change-order email.

To switch to live providers, add user-scoped credentials in **Settings › Secrets** (registered in `server/plugins/secrets.ts`):

| Secret key | Purpose |
| --- | --- |
| `AWX_CLIENT_ID` + `AWX_API_KEY` | Switches Airwallex Issuing from `mock` to live `api.sandbox.airwallex.com` calls |
| `AWX_CARDHOLDER_ID` | Optional pre-created `DELEGATE` cardholder ID in the Airwallex sandbox |
| `ANTHROPIC_API_KEY` | Enables live Claude extraction for arbitrary quotes/PDFs, photo/PDF proof review, and change-order drafting |

## Architecture

```text
app/
  routes/home.tsx                       Contract Jobs workspace route (/home)
  components/clause/ClauseJobWorkspace  5-stage UI (#parse, #approveTerms, [data-charge], proof, change orders)
  components/layout/Sidebar.tsx         Contract Jobs nav link + durable chat thread rail
  components/layout/AgentInspector.tsx  Contextual Clause chat sidebar alongside /home
actions/
  list-jobs.ts · get-job.ts             Read actions (GET) shared by React Query hooks & Clause agent
  parse-quote.ts · approve-terms.ts     Quote extraction -> owner approval -> virtual card creation
  simulate-charge.ts                    Sandbox/mock card authorization + clause-cited decline explainer
  submit-proof.ts · approve-release.ts  Two-layer evidence check + SHA-256/amount-bound milestone release
  draft-change-order.ts · approve-change-order.ts  Contractor email -> change order -> card re-derivation
  reject-pending.ts · freeze-card.ts · close-job.ts · reset-demo.ts
  view-screen.ts · navigate.ts          Live <current-screen> snapshot & tab navigation for Clause agent
server/
  clause/
    contract/                           Zod ContractTerms, verbatim-quote guardrail, change-order engine
    policy/                             Category -> MCC mapping, buildCardPlan(), declineExplainer()
    milestones/                         Evidence evaluator + ContractCardService state machine
    airwallex/                          IssuingGateway interface, MockIssuingGateway, SandboxIssuingGateway
    store/                              JobStore interface, MemoryJobStore (tests), SqlJobStore (Drizzle)
  db/schema.ts                          PostgreSQL/PGlite `cl_jobs` table scoped by `owner_email`
  plugins/                              db.ts (migrations), secrets.ts (vault keys), agent-chat.ts (Clause prompt)
samples/                                Synthetic Maple Street Café quote, expected terms, change-order email
test/flow.test.ts                       Unit + 9-step end-to-end integration tests
```

## Division of responsibility

| Layer | Responsibility |
| --- | --- |
| **Model** | Extracts structured `ContractTerms` with verbatim quotes, evaluates milestone proof files, drafts change-order proposals, and explains declines in chat |
| **Deterministic code** | Validates milestone sums and verbatim quotes, maps categories to MCCs, computes `ALL_TIME` limits and `active_to` cutoffs, enforces SHA-256/amount-bound approvals, and maps decline codes to clauses |
| **Owner (human boundary)** | Explicitly approves card issuance (`approve-terms`), milestone limit increases (`approve-release`), change orders (`approve-change-order`), and job closure (`close-job`) |
