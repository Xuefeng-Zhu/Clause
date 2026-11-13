export const SAMPLE_QUOTE_TEXT = `NORTHSIDE BUILDERS LLC
1180 Industry Way, Redmond, WA 98052 · WA Lic. NORTHBL123AB

QUOTE & SERVICE AGREEMENT  No. Q-2026-0412
Date: October 30, 2026
Client: Maple Street Café LLC, 22 Maple St, Kirkland, WA 98033
Project: Back-of-house kitchen refit (prep line, cabinets, counters, lighting)

Total contract price: USD 12,000.00

§1 Payment schedule
  1.1 Milestone 1 – Demolition & rough-in: USD 4,000.00, released on signing as the
      materials deposit.
  1.2 Milestone 2 – Cabinets & countertops installed: USD 5,000.00, released when the
      Client receives photos of installed base cabinets and countertops.
  1.3 Milestone 3 – Lighting, finish & sign-off: USD 3,000.00, released on the Client's
      receipt of the City of Kirkland final electrical inspection report and a walkthrough.

§2 Use of funds
  2.1 Deposit and milestone funds shall be spent only on building materials, lumber,
      hardware, plumbing and electrical supplies, and paint for this Project.
  2.2 Funds shall not be used for meals, travel, fuel, or tools retained by the Contractor.

§3 Schedule
  3.1 Work begins November 9, 2026.
  3.2 Substantial completion no later than December 18, 2026. Project funds shall not be
      drawn after this date without a signed change order.

§4 Change orders
  4.1 Any change to price, scope, or schedule requires a written change order signed by
      both parties.

§5 Warranty
  5.1 One-year workmanship warranty from sign-off.

Contractor: Dana Ortiz, Northside Builders LLC      Client: ____________________`;

export const SAMPLE_CHANGE_ORDER_EMAIL_TEXT = `From: Dana Ortiz <dana@northside-builders.example>
To: owner@maplestreetcafe.example
Subject: Q-2026-0412 – countertop upgrade + 1 week

Hi,

The quartz you picked is backordered. We can do the in-stock quartz at +$800 for
Milestone 2, but installation slips a week, so we'd need until December 23 to finish.
Can you confirm and we'll send the signed change order?

Thanks,
Dana`;

export type ChargePresetKey = "lumber" | "lunch" | "home-depot" | "after-deadline";

export const PRESET_CHARGES: ReadonlyArray<{
  key: ChargePresetKey;
  label: string;
  sublabel: string;
}> = [
  { key: "lumber", label: "Lumber $1,840.50", sublabel: "Dunn Lumber · MCC 5211" },
  { key: "lunch", label: "Team lunch $86.40", sublabel: "Kirkland Taphouse · MCC 5812" },
  { key: "home-depot", label: "Home Depot $2,500", sublabel: "Home Depot · MCC 5200" },
  { key: "after-deadline", label: "Hardware after deadline", sublabel: "McLendon · Dec 24" },
];

export type DeclaredProofKind =
  | "photos"
  | "inspection_report"
  | "invoice"
  | "walkthrough_signoff";

export const PROOF_KIND_OPTIONS: ReadonlyArray<{
  value: DeclaredProofKind;
  label: string;
}> = [
  { value: "photos", label: "Photos" },
  { value: "inspection_report", label: "Inspection report" },
  { value: "invoice", label: "Invoice" },
  { value: "walkthrough_signoff", label: "Walkthrough sign-off" },
];
