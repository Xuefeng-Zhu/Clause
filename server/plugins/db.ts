import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "cl_jobs",
      sql: `CREATE TABLE IF NOT EXISTS cl_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        contract_ref TEXT NOT NULL DEFAULT '',
        card_id TEXT NOT NULL DEFAULT '',
        doc TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    },
  ],
  { table: "clause_migrations" },
);
