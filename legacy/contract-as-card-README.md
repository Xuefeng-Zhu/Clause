# Contract-as-Card

**Escrow without the escrow.** An agent reads a contractor's quote and turns each clause into a rule on a dedicated Airwallex virtual card. The card itself enforces the contract: the limit is the money released so far, only building-supply merchants work, and the card stops at the deadline. When proof of progress arrives, the agent checks it against the milestone, and on the owner's approval the limit rises to the next milestone. Every decline quotes the clause that caused it.

Airwallex Agentic Banking Hackathon, Expense & Policy track (builds on starter kit 2, Intent-Bound Purchase Agent). Sandbox only. Kits 1–4 need no extra enablement.

## Quick start

```bash
cp .env.example .env        # mock mode by default, no keys needed
npm install
npm test                    # 12 tests: terms, card plan, declines, approvals, change orders
npm run demo:cli            # the whole story in the terminal
npm run dev                 # UI at http://localhost:3000
```

| Mode | What it needs | What it does |
|---|---|---|
| `AWX_MODE=mock` (default) | nothing | In-memory Airwallex that enforces the same controls in the same order, with the sandbox's decline codes |
| `AWX_MODE=sandbox` | `AWX_CLIENT_ID`, `AWX_API_KEY` from sandbox.airwallex.com › Account › Developer › API keys | Real `api.sandbox.airwallex.com` calls |
| `ANTHROPIC_API_KEY` blank | nothing | Offline fixtures for the bundled sample quote, change-order email, and evidence |
| `ANTHROPIC_API_KEY` set | Claude key | Live parsing of any quote (text or PDF), evidence review (photos and PDFs), change-order drafting |

First time on the real sandbox: `AWX_MODE=sandbox npm run smoke:sandbox`. It runs login → cardholder → card with controls → one approved and one declined simulated authorization, printing the raw responses.

## Architecture

```
 quote.pdf / email ──▶ contract/parser.ts ──(Claude tool-use, zod-validated)──▶ ContractTerms
                                                │  every term carries {clause_id, verbatim quote}
                                                ▼
                          contract/schema.ts validateTerms()   ← deterministic: sums, dates, ids
                                                ▼  owner approves terms (UI)
                          policy/cardRules.ts buildCardPlan()  ← pure code: terms → authorization_controls
                                                │     ALL_TIME limit = Σ released milestones
                                                │     allowed_merchant_categories = mcc.ts table
                                                │     active_to = deadline 23:59 local
                                                ▼
                          airwallex/ (IssuingGateway)  ── mock.ts | sandbox.ts ──▶ /issuing/cards/create
                                                ▼
   simulated charge ──▶ /simulation/issuing/create ──▶ FAILED + failure_reason
                                                ▼
                          policy/declineExplainer.ts   ← code maps decline code → rule → clause
   proof upload ──▶ milestones/evidence.ts  (1) code: required evidence kinds present?
                                            (2) Claude: does the content show the condition?
                                                ▼  PendingApproval bound to {milestone, amount, evidence sha256}
                          owner approves ──▶ milestones/service.ts ──▶ /issuing/cards/{id}/update (limit ↑)
   change-order email ──▶ contract/changeOrder.ts (Claude draft) ──▶ owner approves ──▶ card re-derived
```

**Where the model is and isn't**

| Model (Claude) | Code |
|---|---|
| Read the quote and extract terms with verbatim clause quotes | Validate the terms (sums, dates, ids), check quotes appear verbatim |
| Pick spend categories from a fixed enum | Map categories to MCCs (`policy/mcc.ts`) |
| Judge whether photos or an inspection PDF show the milestone | Check required evidence kinds; block release if "insufficient" |
| Draft a change order from an email | Apply it only after approval; re-derive every control |
| — | Every limit, MCC list, time window, card update, and decline explanation |

**Approval boundaries.** A card is issued only after the owner approves the extracted terms. A limit rises only on an approval that matches the pending milestone id, amount, and evidence hash field for field; a stale or edited approval is rejected. A change order changes nothing until it's approved. The owner can freeze the card at any time (`CARD_INACTIVE`).

## Layout

```
src/
  config.ts                 env + sandbox safety checks (refuses non-sandbox base URLs)
  airwallex/
    client.ts               auth (30-min token), request_id per op, 429 backoff
    types.ts                IssuingGateway interface + API shapes
    sandbox.ts              real endpoints (cardholders, cards, update, simulation, transactions)
    mock.ts                 offline gateway enforcing the same controls and decline codes
  contract/
    schema.ts               ContractTerms (zod) + validateTerms()
    parser.ts               Claude extraction (text or PDF) + verbatim-quote guardrail + offline fixture
    changeOrder.ts          draft (Claude) + apply (pure)
  policy/
    mcc.ts                  category → MCC table (review this!)
    cardRules.ts            terms + released milestones → authorization_controls + rule/clause trace
    declineExplainer.ts     decline code → rule → clause quote
  milestones/
    evidence.ts             evidence-kind check (code) + content review (Claude)
    service.ts              the state machine and approval binding
  store/jobStore.ts         JSON-file job store (data/jobs.json, git-ignored)
  server.ts                 Express API + static UI
  demo-cli.ts               terminal walkthrough
  smoke-sandbox.ts          first real-sandbox check
public/                     minimal UI (vanilla JS, no build step)
samples/                    synthetic quote, its expected terms, change-order email
test/flow.test.ts           vitest suite
docs/demo-script.md         4.5-minute video script
```

## API

| Method | Path | Body |
|---|---|---|
| POST | `/api/jobs` | `{text}` or multipart `quote` (PDF) |
| POST | `/api/jobs/:id/approve-terms` | — |
| POST | `/api/jobs/:id/charges` | `{amount, merchant_name, mcc, at?}` (`at` only works in mock) |
| POST | `/api/jobs/:id/proof` | multipart `files[]` + `kinds[]` |
| POST | `/api/jobs/:id/approve-release` | `{approval_id, milestone_id, amount}` |
| POST | `/api/jobs/:id/change-order` | `{text}` |
| POST | `/api/jobs/:id/approve-change-order` | `{approval_id}` |
| POST | `/api/jobs/:id/reject` · `/freeze` · `/close` | — · `{frozen}` · — |

## To verify on the first sandbox run

Marked `TODO(verify)` in code. Confirm each against the docs MCP (`https://mcp.sandbox.airwallex.com/docs`):

1. `authorization_controls` field names (`allowed_merchant_categories`, `transaction_limits.limits[].interval`, `active_from` / `active_to`). They're built only in `policy/cardRules.ts`.
2. REST cardholder create for `DELEGATE`. If REST wants more fields, create it once through the developer MCP and set `AWX_CARDHOLDER_ID`.
3. The `simulation/issuing/create` body (card_id vs card_number, merchant fields).
4. Deadline decline in the real sandbox. The mock's `at` override doesn't exist there, so in the demo issue a second card whose `active_to` is already past, or set a deadline a few minutes out.

Sandbox notes from the builder guide: amounts are major units, per-transaction limits are inclusive, `PER_TRANSACTION` isn't cumulative (so we use `ALL_TIME`), treat `transaction_type: CLEARING` as accepted and `failure_reason` as the decline, rate limit is 10 req/s per endpoint.

## Not in scope (yet)
Real escrow or held balances, contractor-side onboarding, webhooks, multi-job dashboards. All data is synthetic.
