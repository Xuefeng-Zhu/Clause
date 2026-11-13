import type { SpendCategory } from "../contract/schema.js";
import type { PolicySpendCategory } from "../expense/schema.js";

/**
 * Category label -> ISO 18245 merchant category codes. Kept in code, not in the prompt.
 * Review this table before the demo; it's the whole "what counts as building supplies" policy.
 */
export const MCC_BY_CATEGORY: Record<SpendCategory, { mccs: string[]; label: string }> = {
  building_materials: { mccs: ["5039", "5211", "5200"], label: "Construction & building materials (incl. home supply warehouses)" },
  lumber: { mccs: ["5211"], label: "Lumber & building materials stores" },
  hardware: { mccs: ["5072", "5251"], label: "Hardware stores & hardware supplies" },
  plumbing_supplies: { mccs: ["5074"], label: "Plumbing & heating equipment" },
  electrical_supplies: { mccs: ["5065"], label: "Electrical parts & equipment" },
  paint_glass: { mccs: ["5198", "5231"], label: "Paint, glass & wallpaper" },
  home_improvement_warehouse: { mccs: ["5200"], label: "Home supply warehouse stores" },
};

/** Travel & expense policy category -> ISO 18245 MCCs. */
export const POLICY_MCC_BY_CATEGORY: Record<PolicySpendCategory, { mccs: string[]; label: string }> = {
  lodging: { mccs: ["7011"], label: "Hotels & lodging" },
  airfare: { mccs: ["4511", "3058"], label: "Airlines & airfare" },
  ground_transport: { mccs: ["4121", "4111", "4131"], label: "Taxi, rideshare & transit" },
  meals: { mccs: ["5812", "5814"], label: "Restaurants & business meals" },
};

/** Handy labels for the demo's simulated merchants. */
export const DEMO_MCC_NAMES: Record<string, string> = {
  "5200": "Home supply warehouse",
  "5211": "Lumber & building materials",
  "5251": "Hardware store",
  "5074": "Plumbing supply",
  "5065": "Electrical supply",
  "5231": "Paint & glass",
  "5812": "Restaurant",
  "5814": "Fast food / cafe",
  "5813": "Bar & cocktail lounge",
  "5541": "Gas station",
  "4511": "Airline",
  "3058": "Airline",
  "7011": "Hotel & lodging",
  "4121": "Rideshare & taxi",
  "4111": "Commuter transit",
  "4131": "Bus line",
  "5732": "Electronics store",
  "5734": "Software store",
  "5999": "Gift cards & specialty retail",
};

export function mccsFor(categories: SpendCategory[]): string[] {
  return [...new Set(categories.flatMap((c) => MCC_BY_CATEGORY[c].mccs))].sort();
}

export function policyMccsFor(categories: PolicySpendCategory[]): string[] {
  return [...new Set(categories.flatMap((c) => POLICY_MCC_BY_CATEGORY[c].mccs))].sort();
}

export function categoryForMcc(mcc: string, categories: SpendCategory[]): SpendCategory | undefined {
  return categories.find((c) => MCC_BY_CATEGORY[c].mccs.includes(mcc));
}

export function policyCategoryForMcc(
  mcc: string,
  categories: PolicySpendCategory[],
): PolicySpendCategory | undefined {
  return categories.find((c) => POLICY_MCC_BY_CATEGORY[c].mccs.includes(mcc));
}

/**
 * MCCs that fall under a contract's explicit "funds shall not be used for meals, travel, fuel" clause.
 * Used only to cite the right clause on a decline; the card's allowlist already blocks them.
 */
export const PROHIBITED_MCCS: Record<string, string> = {
  "5812": "meals", "5813": "meals", "5814": "meals",
  "5541": "fuel", "5542": "fuel",
  "4511": "travel", "3000": "travel", "4111": "travel", "4121": "travel", "7011": "travel",
};

/**
 * MCCs that map to specific prohibited clauses in a travel & expense policy.
 * Used to cite §4.1 vs §4.2 deterministically when the card's allowlist declines them.
 */
export const POLICY_PROHIBITED_MCCS: Record<string, { clauseId: string; kind: string }> = {
  "5813": { clauseId: "§4.2", kind: "bars, nightclubs, and alcohol-only venues" },
  "5732": { clauseId: "§4.1", kind: "personal purchases, electronics, and gift cards" },
  "5734": { clauseId: "§4.1", kind: "personal purchases, electronics, and gift cards" },
  "5999": { clauseId: "§4.1", kind: "personal purchases, electronics, and gift cards" },
};
