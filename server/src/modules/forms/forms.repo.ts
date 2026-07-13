import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { docs, formSubmissions, forms, users } from "../../db/schema.js";
export { docs, formSubmissions, forms, users };
export async function getFormById(id: number, executor: any = db) {
  return dbGet<typeof forms.$inferSelect>(executor.select().from(forms).where(eq(forms.id, id)).limit(1));
}

export async function getFormByUid(formUid: string) {
  return dbGet<typeof forms.$inferSelect>(db.select().from(forms).where(eq(forms.formUid, formUid)).limit(1));
}

export async function listFormsByOwner(ownerId: number) {
  return dbAll(db.select().from(forms).where(eq(forms.ownerId, ownerId)).orderBy(sql`${forms.updatedAt} desc`));
}

export async function listAllForms() {
  return dbAll(db.select().from(forms));
}

export async function insertForm(values: {
  formUid: string;
  title: string;
  description: string | null;
  fields: string;
  ownerId: number;
  status: string;
  maxSubmissions: number | null;
  allowMultiple: boolean;
  exclusiveInfo: string | null;
  privacyNotice: string | null;
  retentionDays: number | null;
  storeUserAgent: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const result = await dbRun(db.insert(forms).values(values));
  return { lastInsertRowid: result.lastInsertRowid };
}

export async function updateFormById(id: number, patch: Record<string, unknown>, executor: any = db) {
  await dbRun(executor.update(forms).set(patch).where(eq(forms.id, id)));
}

export async function deleteFormById(id: number, executor: any = db) {
  await dbRun(executor.delete(forms).where(eq(forms.id, id)));
}

export async function updateFormSubmissionCount(formId: number, delta: number, executor: any = db) {
  if (delta > 0) {
    await dbRun(executor.update(forms).set({ submissionCount: sql`${forms.submissionCount} + ${delta}` }).where(and(eq(forms.id, formId), eq(forms.status, "published"))));
  } else {
    await dbRun(executor.update(forms).set({ submissionCount: sql`CASE WHEN ${forms.submissionCount} >= ${-delta} THEN ${forms.submissionCount} - ${-delta} ELSE 0 END` }).where(eq(forms.id, formId)));
  }
}

export async function resetFormSubmissionCount(formId: number, executor: any = db) {
  await dbRun(executor.update(forms).set({ submissionCount: sql`${forms.submissionCount}` }).where(eq(forms.id, formId)));
}

export async function deleteFormSubmissionsByFormId(formId: number, executor: any = db) {
  return dbRun(executor.delete(formSubmissions).where(eq(formSubmissions.formId, formId)));
}

export async function deleteFormSubmissionById(submissionId: number, executor: any = db) {
  return dbRun(executor.delete(formSubmissions).where(eq(formSubmissions.id, submissionId)));
}

export async function getSubmissionById(submissionId: number, executor: any = db) {
  return dbGet<typeof formSubmissions.$inferSelect>(executor.select().from(formSubmissions).where(eq(formSubmissions.id, submissionId)).limit(1));
}

export async function countSubmissionsByFormId(formId: number) {
  const result = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(formSubmissions).where(eq(formSubmissions.formId, formId)));
  return Number(result?.count ?? 0);
}

export async function listSubmissionsByFormId(formId: number, pageSize: number, offset: number) {
  return dbAll(
    db.select().from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .orderBy(sql`${formSubmissions.submittedAt} desc`)
      .limit(pageSize + 1)
      .offset(offset)
  );
}

export async function listAllSubmissionsByFormId(formId: number) {
  return dbAll(
    db.select().from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .orderBy(sql`${formSubmissions.submittedAt} desc`)
  );
}

export async function countSubmissionsByIp(formId: number, ipPrefix: string) {
  const result = await dbGet<{ count: number }>(
    db.select({ count: sql<number>`count(*)` })
      .from(formSubmissions)
      .where(and(eq(formSubmissions.formId, formId), eq(formSubmissions.ip, ipPrefix)))
  );
  return Number(result?.count ?? 0);
}

export async function countSubmissionsBySubmitterId(formId: number, submitterId: string, executor: any = db) {
  const result = await dbGet<{ count: number }>(
    executor.select({ count: sql<number>`count(*)` })
      .from(formSubmissions)
      .where(and(eq(formSubmissions.formId, formId), eq(formSubmissions.submitterId, submitterId)))
  );
  return Number(result?.count ?? 0);
}

export async function countRecentSubmissionsByIp(formId: number, ipPrefix: string, since: Date) {
  const result = await dbGet<{ count: number }>(
    db.select({ count: sql<number>`count(*)` })
      .from(formSubmissions)
      .where(and(eq(formSubmissions.formId, formId), eq(formSubmissions.ip, ipPrefix), gte(formSubmissions.submittedAt, since)))
  );
  return Number(result?.count ?? 0);
}

export async function insertSubmission(values: {
  formId: number;
  data: string;
  ip: string;
  submitterId: string | null;
  userAgent: string | null;
  submittedAt: Date;
}, executor: any = db) {
  return dbRun(executor.insert(formSubmissions).values(values));
}

export async function cleanupExpiredSubmissions(formId: number, cutoff: Date, executor: any = db) {
  return dbRun(executor.delete(formSubmissions).where(and(eq(formSubmissions.formId, formId), lt(formSubmissions.submittedAt, cutoff))));
}

export async function recalculateAllFormCounts() {
  return dbAll<{ id: number; count: number }>(
    db.select({ id: forms.id, count: sql<number>`count(${formSubmissions.id})` })
      .from(forms)
      .leftJoin(formSubmissions, eq(formSubmissions.formId, forms.id))
      .groupBy(forms.id)
  );
}

export async function updateFormCountIfMismatch(formId: number, actualCount: number, executor: any = db) {
  return dbRun(executor.update(forms).set({ submissionCount: actualCount }).where(and(eq(forms.id, formId), sql`${forms.submissionCount} <> ${actualCount}`)));
}

export async function getFormIpStats(formId: number) {
  return dbAll(
    db.select({
      ip: formSubmissions.ip,
      count: sql<number>`count(*)`,
      firstAt: sql<Date>`min(${formSubmissions.submittedAt})`,
      lastAt: sql<Date>`max(${formSubmissions.submittedAt})`
    })
      .from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .groupBy(formSubmissions.ip)
      .orderBy(sql`count(*) desc`)
      .limit(100)
  );
}

export async function incrementFormViewCount(formUid: string) {
  return dbRun(
    db.update(forms).set({ viewCount: sql`${forms.viewCount} + 1` }).where(eq(forms.formUid, formUid))
  ).catch(() => undefined);
}

export async function incrementFormSubmissionCountCond(formId: number, maxSubmissions: number | null, executor: any = db) {
  if (maxSubmissions === null) {
    return dbRun(executor.update(forms).set({ submissionCount: sql`${forms.submissionCount} + 1` }).where(and(eq(forms.id, formId), eq(forms.status, "published"))));
  }
  return dbRun(executor.update(forms).set({ submissionCount: sql`${forms.submissionCount} + 1` }).where(and(eq(forms.id, formId), eq(forms.status, "published"), lt(forms.submissionCount, maxSubmissions))));
}
