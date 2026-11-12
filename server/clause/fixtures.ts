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
