import { pgTable, text } from "drizzle-orm/pg-core";

/**
 * One row per contract job. `doc` holds the full Job document (terms, card rules, pending
 * approval, transactions, events) as JSON; status and card_id are lifted out for listing.
 * Money limits never live here as a source of truth: they are re-derived from the terms in
 * code (policy/cardRules.ts) on every change.
 */
export const jobs = pgTable("cl_jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  contractRef: text("contract_ref").notNull().default(""),
  cardId: text("card_id").notNull().default(""),
  doc: text("doc").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
