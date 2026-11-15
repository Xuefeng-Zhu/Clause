# Clause

Clause turns a contractor quote or an approved business trip into an Airwallex virtual card with spending controls derived from the source document. Contract cards use a cumulative cap based on released milestones and pair with a Metal payout mandate. Trip cards use a trip budget, a per-charge cap, and manager-approved exceptions. Clause shows the source clauses behind each planned rule and cites the applicable clause when a decline maps to one.

## Quick start

Use Node.js 22.22.0 or later and pnpm 10.29.1, the version pinned in [package.json](./package.json). Corepack selects that version for the commands below.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open the URL printed by the dev server, usually `http://localhost:8080`. On the welcome screen, choose **Continue as local dev** to reach the **Contract Jobs** workspace at `/home`.

Both walkthroughs use the default in-memory Airwallex and Metal mocks and the bundled parsing fixtures. They require zero external keys. **Sandbox → Environment & parser** shows the card gateway and parser in use. The optional Clause chat sidebar and full-screen chat at `/chat` require an Agent-Native model connection. Use the chat setup prompt or **Settings → Model**.

## Run the demos

Start each walkthrough with **New job**. The sample dates are fixed. Run the ordinary authorizations before the relevant sample card expires on November 23, 2026 for the trip or December 18, 2026 for the original contract. The explicitly dated late presets are designed to show expiry declines.

### Contractor quote · Maple Street Café

1. Choose **Use sample quote** and **Read quote** to load [the Maple Street Café quote](./samples/quote-maple-street-cafe.txt). Review its clauses and choose **Approve & issue card**. The signing milestone (M1) sets the initial cumulative card cap at **$4,000**, and approval creates a contractor payout mandate.
2. Open **Sandbox**. Run **Dunn Lumber ($1,840.50)**, **Kirkland Taphouse ($86.40)**, then **Home Depot ($2,500)** in that order. Lumber is approved. Lunch is declined under the meals ban (§2.2). Home Depot exceeds the remaining released funds (§1.1).
3. In **Metal payout mandate**, run **Pay contractor over the cap** and **Pay a different wallet**. The payout attempts are refused. Close the drawer.
4. Choose **Submit proof for Milestone 2**, keep **Photos** selected, and choose **Evaluate proof**. With the attachment field empty, Clause uses the [bundled cabinet photo](./public/samples/cabinets-installed.jpg). Review the verdict and choose the **Approve release** button for Milestone 2. The cap rises to **$9,000**. In mock mode this also records a **50 USDZ** simulated Metal payout and a **$5,000** simulated Airwallex deposit. Reopen **Sandbox** and retry **Home Depot** to see it approved. Close the drawer.
5. Choose **Propose change order**. Keep the prefilled [sample email](./samples/change-order-email.txt) and choose **Propose change order** again inside the sheet. Review the changes and choose the approval button. The released cap rises to **$9,800**, the deadline moves to December 23, 2026, and Clause replaces the mandate with higher limits while carrying forward recorded spend.
6. Reopen **Sandbox**, run **McLendon Hardware** dated December 24, and confirm the deadline decline cites the approved change order. Choose **Verify mandate on chain** to check the mandate. In mock mode the two refusals and one payment come from in-memory state.

### Travel and expense policy · Acme Robotics

1. Choose **Travel policy + trip request** and **Read policy & trip** to load [the Acme policy and trip TR-2611](./samples/policy-acme-trip.txt). Review the extracted terms and choose **Approve & issue trip card**. In mock mode the card has a **$2,000** trip budget and a **$300** per-charge cap.
2. Open **Sandbox** and run the presets for **Hyatt Regency Austin ($289)** and **Uber Trip ($34.60)**. Both pass. **Rainey St. Cocktail Bar ($142)** and **Best Buy #512 ($899)** are declined under §§4.2 and 4.1, respectively. The **Uber Trip** dated November 26 is declined under the expiry clause (§2.1).
3. Turn on **Employee phone view** in the Sandbox drawer. Run **Uchi Austin ($480)** and confirm the decline cites the single-charge cap (§3.3). Close the drawer. In the phone view, keep the sample note naming the client and four attendees, then choose **Request an exception (§3.4)**.
4. Choose **Approve exception** under **Live enforcement**. The sample per-attendee rule allows **$500** for four named attendees. Reopen **Sandbox** and retry **Uchi Austin**. The charge passes and the simulator restores the **$300** base cap. Run the same preset once more to see it declined again.
5. Close the drawer, open **Expense report — auto-generated**, and choose **Export CSV**. With the two approved in-policy charges and one approved dinner, the report shows **$803.60** in approved spend, the blocked attempts, and **$0.00** owed to the traveler.

**Reset demo** deletes every job belonging to the signed-in user, including custom jobs, and clears the app process's mock gateways. Previously issued Airwallex sandbox cards and Metal testnet mandates remain on their respective services.

## Provider configuration

For custom contractor quotes and trip policies, paste the document text into **New job**. Milestone proof accepts JPEG or PNG photos and PDFs. The workspace registers the following keys in **Settings → API keys**.

| Setting | Effect |
| --- | --- |
| `AWX_CLIENT_ID` and `AWX_API_KEY` | Enables Airwallex Issuing calls to `api.sandbox.airwallex.com`. All card transactions in the walkthrough are simulated. |
| `AWX_CARDHOLDER_ID` | Optionally reuses a pre-created `DELEGATE` cardholder in the Airwallex sandbox. |
| `GEMINI_API_KEY` | Enables Gemini for quote and policy extraction, proof review, change orders, and exception notes. |
| `ANTHROPIC_API_KEY` | Enables Claude for those tasks when Gemini is unconfigured. |

The workspace can fall back to bundled fixtures on model failure. Offline proof evaluation checks the declared evidence kinds and uses a filename heuristic. The current document workflow stores resolved model keys in process-wide configuration, so a request without a key can reuse a previous request's key.

Metal defaults to mock mode independently of Airwallex. See the [development guide](./DEVELOPING.md) for the testnet account, CLI, and deployment settings.

## Sandbox limits

- The Airwallex sandbox adapter can retry a trip card create or update with only `PER_TRANSACTION` when a request with both limits fails. Clause still stores and displays its planned `ALL_TIME` budget. Inspect the sandbox card's actual controls when verifying cumulative enforcement.
- A manager exception temporarily raises the card-wide per-charge limit for all allowed merchant categories. Clause restores the base cap immediately after an approved simulated purchase or before the next simulated purchase after the two-hour window expires.
- Airwallex sandbox uses its own clock. For future-dated expiry presets, Clause can temporarily move the sandbox card's validity window into the past and then attempts to restore it. The local mock evaluates the preset timestamp directly.
- Mock card and payout state lives in the app process. Jobs persist in SQL, so create a fresh job to get a usable mock card after restarting the server.
- Mock Metal verification reads in-memory state even when the UI says **Verify mandate on chain**. On-chain verification uses Metal testnet. The Airwallex deposit associated with a successful payout is a separate simulation.
- Frozen cards, closed cards, and insufficient wallet funds can produce declines without a source clause citation.

## How it works

- The model extracts document terms, reviews proof, and drafts change orders and exception requests. Code validates the extracted terms, computes card and payout controls, and maps provider outcomes to clauses when applicable.
- The owner or manager approves changes to spending power. A release must match its pending approval ID, milestone, and amount. The workspace supplies the evidence SHA-256 and currency, which the action checks when provided.
- The workspace and chat use typed actions in [`actions/`](./actions/). The job service lives in [`server/clause/`](./server/clause/) and stores jobs in the SQL `cl_jobs` table scoped by `owner_email`. See the [agent guide](./AGENTS.md) for the action reference and the [development guide](./DEVELOPING.md) for local checks and architecture.
