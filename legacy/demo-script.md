# Demo script, about 4:30 (limit is 5:00)

Setup: `AWX_MODE=sandbox`, Claude key set, `npm run dev`, browser at localhost:3000, a second tab open on the Airwallex sandbox web app showing Cards.

| Time | Beat | Say | Show |
|---|---|---|---|
| 0:00 | Problem | "Small businesses hand contractors thousands of dollars in deposits and hope it goes to materials and the job finishes on time. Real escrow is too slow and too expensive for a $12K job." | Title card |
| 0:20 | Goal | "Maple Street Café is refitting its kitchen. Here's the contractor's quote." | Quote in the textarea (or drop the PDF) |
| 0:35 | Agent reads | "Claude extracts every term, and each one keeps the exact clause it came from." | Click **Read quote**. The terms table shows §1.1–§3.2 quotes |
| 1:00 | Code decides | "The model doesn't set limits. Code turns the terms into card controls: $4,000 released, building-supply merchants only, valid until December 18." | Card-rule column; click **Approve terms & issue card** |
| 1:20 | Real card | "That's a real Airwallex sandbox card." | Switch to the sandbox tab and show the card and its controls |
| 1:35 | Normal spend | "Lumber at Dunn: approved." | **Lumber $1,840.50** → ✓ |
| 1:50 | Decline 1 | "Team lunch on the job card is declined by Airwallex, and the agent tells you which clause it broke." | **Team lunch** → `MERCHANT_CATEGORY_NOT_ALLOWED` + §2.1 |
| 2:10 | Decline 2 | "Trying to pull ahead of the schedule: declined, because only the deposit is released." | **Home Depot $2,500** → `LIMIT_EXCEEDED` + §1.1 |
| 2:30 | New evidence | "Cabinets are in. The contractor uploads photos. First code checks the right kind of evidence is there, then Claude checks the photos actually show installed cabinets and counters." | Upload photos → pending card with verdict + reasoning |
| 2:55 | Human boundary | "The owner approves. That approval is bound to this milestone, this amount, and these exact files. Change any of them and it's void." | Point at approval id + hash; click **Approve release** |
| 3:10 | Decision changed | "Limit is now $9,000, and the same $2,500 charge clears." | Card limit animates; re-run **Home Depot** → ✓ |
| 3:25 | Contract changes | "The quartz is backordered. Claude reads the email and drafts a change order: +$800, deadline Dec 23. Nothing changes until the owner signs off." | Paste email → **Draft change order** → approve → card rules update |
| 3:50 | Deadline | "After the deadline the card simply stops working." | `OUT_OF_ALLOWED_TIME_RANGE` + clause (sandbox: a pre-made card with a past `active_to`) |
| 4:05 | Wrap | "Every rule traces to a clause, every raise needs a bound approval, and the payment instrument itself enforces the contract. Contract-as-Card." | Agent log scrolling |

Backup if the sandbox is slow: `AWX_MODE=mock` gives the same screens with the same decline codes.
