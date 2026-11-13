// Generated from samples/. Bundled so the demo and the no-key fallback work after `agent-native build`.
export const SAMPLE_QUOTE = "NORTHSIDE BUILDERS LLC\n1180 Industry Way, Redmond, WA 98052 \u00b7 WA Lic. NORTHBL123AB (synthetic)\n\nQUOTE & SERVICE AGREEMENT  No. Q-2026-0412\nDate: October 30, 2026\nClient: Maple Street Caf\u00e9 LLC, 22 Maple St, Kirkland, WA 98033\nProject: Back-of-house kitchen refit (prep line, cabinets, counters, lighting)\n\nTotal contract price: USD 12,000.00\n\n\u00a71 Payment schedule\n  1.1 Milestone 1 \u2013 Demolition & rough-in: USD 4,000.00, released on signing as the\n      materials deposit.\n  1.2 Milestone 2 \u2013 Cabinets & countertops installed: USD 5,000.00, released when the\n      Client receives photos of installed base cabinets and countertops.\n  1.3 Milestone 3 \u2013 Lighting, finish & sign-off: USD 3,000.00, released on the Client's\n      receipt of the City of Kirkland final electrical inspection report and a walkthrough.\n\n\u00a72 Use of funds\n  2.1 Deposit and milestone funds shall be spent only on building materials, lumber,\n      hardware, plumbing and electrical supplies, and paint for this Project.\n  2.2 Funds shall not be used for meals, travel, fuel, or tools retained by the Contractor.\n\n\u00a73 Schedule\n  3.1 Work begins November 9, 2026.\n  3.2 Substantial completion no later than December 18, 2026. Project funds shall not be\n      drawn after this date without a signed change order.\n\n\u00a74 Change orders\n  4.1 Any change to price, scope, or schedule requires a written change order signed by\n      both parties.\n\n\u00a75 Warranty\n  5.1 One-year workmanship warranty from sign-off.\n\nContractor: Dana Ortiz, Northside Builders LLC      Client: ____________________\n";

export const SAMPLE_CHANGE_ORDER_EMAIL = "From: Dana Ortiz <dana@northside-builders.example>\nTo: owner@maplestreetcafe.example\nSubject: Q-2026-0412 \u2013 countertop upgrade + 1 week\n\nHi,\n\nThe quartz you picked is backordered. We can do the in-stock quartz at +$800 for\nMilestone 2, but installation slips a week, so we'd need until December 23 to finish.\nCan you confirm and we'll send the signed change order?\n\nThanks,\nDana\n";

export const SAMPLE_TERMS = {
  "contract_ref": "Q-2026-0412",
  "contractor_name": "Northside Builders LLC",
  "client_name": "Maple Street Caf\u00e9 LLC",
  "project": "Back-of-house kitchen refit (prep line, cabinets, counters, lighting)",
  "currency": "USD",
  "total_amount": 12000,
  "milestones": [
    {
      "id": "M1",
      "name": "Demolition & rough-in",
      "amount": 4000,
      "release_condition": "Released on signing as the materials deposit.",
      "evidence_required": [],
      "released_on_signing": true,
      "clause": {
        "clause_id": "\u00a71.1",
        "quote": "Milestone 1 \u2013 Demolition & rough-in: USD 4,000.00, released on signing as the materials deposit."
      }
    },
    {
      "id": "M2",
      "name": "Cabinets & countertops installed",
      "amount": 5000,
      "release_condition": "Client receives photos of installed base cabinets and countertops.",
      "evidence_required": [
        "photos"
      ],
      "released_on_signing": false,
      "clause": {
        "clause_id": "\u00a71.2",
        "quote": "Milestone 2 \u2013 Cabinets & countertops installed: USD 5,000.00, released when the Client receives photos of installed base cabinets and countertops."
      }
    },
    {
      "id": "M3",
      "name": "Lighting, finish & sign-off",
      "amount": 3000,
      "release_condition": "Client receives the City of Kirkland final electrical inspection report and a walkthrough.",
      "evidence_required": [
        "inspection_report",
        "walkthrough_signoff"
      ],
      "released_on_signing": false,
      "clause": {
        "clause_id": "\u00a71.3",
        "quote": "Milestone 3 \u2013 Lighting, finish & sign-off: USD 3,000.00, released on the Client's receipt of the City of Kirkland final electrical inspection report and a walkthrough."
      }
    }
  ],
  "allowed_spend": {
    "categories": [
      "building_materials",
      "lumber",
      "hardware",
      "plumbing_supplies",
      "electrical_supplies",
      "paint_glass",
      "home_improvement_warehouse"
    ],
    "clause": {
      "clause_id": "\u00a72.1",
      "quote": "Deposit and milestone funds shall be spent only on building materials, lumber, hardware, plumbing and electrical supplies, and paint for this Project."
    }
  },
  "prohibited_spend": {
    "description": "Meals, travel, fuel, or tools retained by the Contractor.",
    "clause": {
      "clause_id": "\u00a72.2",
      "quote": "Funds shall not be used for meals, travel, fuel, or tools retained by the Contractor."
    }
  },
  "start_date": "2026-11-09",
  "deadline": {
    "date": "2026-12-18",
    "clause": {
      "clause_id": "\u00a73.2",
      "quote": "Substantial completion no later than December 18, 2026. Project funds shall not be drawn after this date without a signed change order."
    }
  },
  "change_order_clause": {
    "clause_id": "\u00a74.1",
    "quote": "Any change to price, scope, or schedule requires a written change order signed by both parties."
  },
  "open_questions": []
} as const;

export const SAMPLE_POLICY = `ACME ROBOTICS INC. — TRAVEL & EXPENSE POLICY  (v3, effective Jan 1, 2026)

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
Approved budget: USD 2,000.00
`;

export const SAMPLE_EXCEPTION_NOTE =
  "Client dinner with Lone Star Logistics: Dana Ruiz (VP Ops), Kevin Tran (Ops lead), plus me and Marcus Lee. 4 attendees.";

export const SAMPLE_POLICY_TERMS = {
  policy_ref: "TR-2611",
  company: "Acme Robotics Inc.",
  traveler: "Priya Shah",
  traveler_email: "priya.shah@acme-robotics.example",
  approver: "Marcus Lee",
  purpose: "On-site pilot review with Lone Star Logistics, Austin TX",
  currency: "USD",
  budget: {
    amount: 2000,
    clause: {
      clause_id: "§2.2",
      quote: "The card limit equals the approved trip budget.",
    },
  },
  per_charge_cap: {
    amount: 300,
    clause: {
      clause_id: "§3.3",
      quote: "No single charge may exceed USD 300 without manager pre-approval.",
    },
  },
  lodging_clause: {
    clause_id: "§3.1",
    quote: "Lodging up to USD 300 per night.",
  },
  allowed_spend: {
    categories: ["lodging", "airfare", "ground_transport", "meals"],
    clause: {
      clause_id: "§3.2",
      quote: "Airfare (economy), ground transport (taxi, rideshare, transit) and business meals.",
    },
  },
  prohibited_spend: [
    {
      description: "Personal purchases, electronics, and gift cards.",
      clause: {
        clause_id: "§4.1",
        quote: "Personal purchases, electronics, and gift cards.",
      },
    },
    {
      description: "Bars, nightclubs and alcohol-only venues.",
      clause: {
        clause_id: "§4.2",
        quote: "Bars, nightclubs and alcohol-only venues.",
      },
    },
  ],
  trip_start: "2026-11-18",
  trip_end: "2026-11-21",
  card_expires: {
    date: "2026-11-23",
    clause: {
      clause_id: "§2.1",
      quote:
        "Each approved trip gets its own virtual card. It activates when the trip is approved and expires 48 hours after the scheduled return date.",
    },
  },
  exception_clause: {
    per_attendee_cap: 125,
    clause: {
      clause_id: "§3.4",
      quote:
        "Client entertainment of up to USD 125 per attendee is allowed with manager approval that names the client and the attendees.",
    },
  },
  open_questions: [],
} as const;
