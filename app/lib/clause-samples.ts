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

export const SAMPLE_POLICY_TEXT = `ACME ROBOTICS INC. — TRAVEL & EXPENSE POLICY  (v3, effective Jan 1, 2026)

§1 Scope
  1.1 Applies to all business travel paid with an Acme corporate card.

§2 Trip cards
  2.1 Each approved trip gets its own virtual card. It activates when the trip is approved and
      expires 48 hours after the scheduled return date.
  2.2 The card limit equals the approved trip budget.

§3 Allowed spend
  3.1 Lodging up to USD 300 per night.
  3.2 Airfare (economy), ground transport (taxi, rideshare, transit) and business meals.
  3.3 No single charge may exceed USD 300 without manager pre-approval.
  3.4 Client entertainment of up to USD 125 per attendee is allowed with manager approval
      that names the client and the attendees.

§4 Not reimbursable
  4.1 Personal purchases, electronics, and gift cards.
  4.2 Bars, nightclubs and alcohol-only venues.
  4.3 Entertainment not covered by §3.4.

----------------------------------------------------------------
TRIP REQUEST TR-2611 — APPROVED by Marcus Lee (Sales Director), Nov 12, 2026
Traveler: Priya Shah, Account Executive (priya.shah@acme-robotics.example)
Purpose: On-site pilot review with Lone Star Logistics, Austin TX
Dates: Nov 18 – Nov 21, 2026 (return Nov 21)
Approved budget: USD 2,000.00`;

export const SAMPLE_EXCEPTION_NOTE_TEXT =
  "Client dinner with Lone Star Logistics: Dana Ruiz (VP Ops), Kevin Tran (Ops lead), plus me (Priya Shah) and Marcus Lee. 4 attendees.";

export type ContractChargePresetKey = "lumber" | "lunch" | "home-depot" | "after-deadline";
export type PolicyChargePresetKey = "hotel" | "uber" | "bar" | "bestbuy" | "dinner" | "late";
export type ChargePresetKey = ContractChargePresetKey | PolicyChargePresetKey;

export const PRESET_CHARGES: ReadonlyArray<{
  key: ContractChargePresetKey;
  label: string;
  sublabel: string;
}> = [
  { key: "lumber", label: "Lumber $1,840.50", sublabel: "Dunn Lumber · MCC 5211" },
  { key: "lunch", label: "Team lunch $86.40", sublabel: "Kirkland Taphouse · MCC 5812" },
  { key: "home-depot", label: "Home Depot $2,500", sublabel: "Home Depot · MCC 5200" },
  { key: "after-deadline", label: "Hardware after deadline", sublabel: "McLendon · Dec 24" },
];

export const POLICY_PRESET_CHARGES: ReadonlyArray<{
  key: PolicyChargePresetKey;
  label: string;
  sublabel: string;
}> = [
  { key: "hotel", label: "Hyatt Regency Austin $289.00", sublabel: "Hotel & lodging · MCC 7011" },
  { key: "uber", label: "Uber Trip $34.60", sublabel: "Rideshare · MCC 4121" },
  { key: "bar", label: "Rainey St. Cocktail Bar $142.00", sublabel: "Cocktail bar · MCC 5813" },
  { key: "bestbuy", label: "Best Buy #512 $899.00", sublabel: "Electronics · MCC 5732" },
  { key: "dinner", label: "Uchi Austin $480.00", sublabel: "Client dinner · MCC 5812" },
  { key: "late", label: "Uber Trip (Nov 26) $41.00", sublabel: "Post-return · MCC 4121" },
];

export const ALL_PRESET_CHARGES: ReadonlyArray<{
  key: ChargePresetKey;
  label: string;
  sublabel: string;
}> = [...PRESET_CHARGES, ...POLICY_PRESET_CHARGES];

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
