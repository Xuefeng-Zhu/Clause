import type { SpendCategory } from "../contract/schema.js";

/**
 * Category label -> ISO 18245 merchant category codes. Kept in code, not in the prompt.
 * Review this table before the demo; it's the whole "what counts as building supplies" policy.
 */
export const MCC_BY_CATEGORY: Record<SpendCategory, { mccs: string[]; label: string }> = {
  building_materials: { mccs: ["5039", "5211"], label: "Construction & building materials" },
  lumber: { mccs: ["5211"], label: "Lumber & building materials stores" },
  hardware: { mccs: ["5072", "5251"], label: "Hardware stores & hardware supplies" },
  plumbing_supplies: { mccs: ["5074"], label: "Plumbing & heating equipment" },
  electrical_supplies: { mccs: ["5065"], label: "Electrical parts & equipment" },
  paint_glass: { mccs: ["5198", "5231"], label: "Paint, glass & wallpaper" },
  home_improvement_warehouse: { mccs: ["5200"], label: "Home supply warehouse stores" },
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
  "5541": "Gas station",
  "4511": "Airline",
};

export function mccsFor(categories: SpendCategory[]): string[] {
  return [...new Set(categories.flatMap((c) => MCC_BY_CATEGORY[c].mccs))].sort();
}

export function categoryForMcc(mcc: string, categories: SpendCategory[]): SpendCategory | undefined {
  return categories.find((c) => MCC_BY_CATEGORY[c].mccs.includes(mcc));
}
