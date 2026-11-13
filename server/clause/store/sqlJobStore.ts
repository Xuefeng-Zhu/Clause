import { fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "../../db/index.js";
import { jobs } from "../../db/schema.js";
import type { Job, JobStore } from "./jobStore.js";

function requireOwnerEmail(): string {
  const ownerEmail = getRequestUserEmail();
  if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
  return ownerEmail;
}

export class SqlJobStore implements JobStore {
  async get(id: string): Promise<Job> {
    const ownerEmail = requireOwnerEmail();
    const [row] = await getDb()
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.ownerEmail, ownerEmail)));
    if (!row) throw new Error(`Job ${id} not found`);
    return JSON.parse(row.doc) as Job;
  }

  async list(): Promise<Job[]> {
    const ownerEmail = requireOwnerEmail();
    const rows = await getDb()
      .select()
      .from(jobs)
      .where(eq(jobs.ownerEmail, ownerEmail))
      .orderBy(desc(jobs.createdAt))
      .limit(100);
    return rows.map((r) => JSON.parse(r.doc) as Job);
  }

  async save(job: Job): Promise<Job> {
    const ownerEmail = requireOwnerEmail();
    const now = new Date().toISOString();
    job.created_at ??= now;
    const values = {
      id: job.id,
      ownerEmail,
      status: job.status,
      contractRef:
        (job.kind === "policy" ? job.policyTerms?.policy_ref : job.terms.contract_ref) ??
        job.terms.contract_ref,
      cardId: job.card_id ?? "",
      doc: JSON.stringify(job),
      createdAt: job.created_at,
      updatedAt: now,
    };
    await getDb()
      .insert(jobs)
      .values(values)
      .onConflictDoUpdate({
        target: jobs.id,
        set: {
          status: values.status,
          contractRef: values.contractRef,
          cardId: values.cardId,
          doc: values.doc,
          updatedAt: now,
        },
        setWhere: eq(jobs.ownerEmail, ownerEmail),
      });
    return job;
  }

  async reset(): Promise<void> {
    const ownerEmail = requireOwnerEmail();
    await getDb().delete(jobs).where(eq(jobs.ownerEmail, ownerEmail));
  }
}
