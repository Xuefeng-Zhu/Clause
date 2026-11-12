import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { jobs } from "../../db/schema.js";
import type { Job, JobStore } from "./jobStore.js";

export class SqlJobStore implements JobStore {
  async get(id: string): Promise<Job> {
    const [row] = await getDb().select().from(jobs).where(eq(jobs.id, id));
    if (!row) throw new Error(`Job ${id} not found`);
    return JSON.parse(row.doc) as Job;
  }
  async list(): Promise<Job[]> {
    const rows = await getDb().select().from(jobs).orderBy(desc(jobs.createdAt));
    return rows.map((r) => JSON.parse(r.doc) as Job);
  }
  async save(job: Job): Promise<Job> {
    const now = new Date().toISOString();
    job.created_at ??= now;
    const values = {
      id: job.id,
      status: job.status,
      contractRef: job.terms.contract_ref,
      cardId: job.card_id ?? "",
      doc: JSON.stringify(job),
      createdAt: job.created_at,
      updatedAt: now,
    };
    await getDb()
      .insert(jobs)
      .values(values)
      .onConflictDoUpdate({ target: jobs.id, set: { status: values.status, contractRef: values.contractRef, cardId: values.cardId, doc: values.doc, updatedAt: now } });
    return job;
  }
  async reset(): Promise<void> {
    await getDb().delete(jobs);
  }
}
