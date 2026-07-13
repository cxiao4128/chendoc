import { and, eq, gte, sql } from "drizzle-orm";
import { db, dbGet, dbRun } from "../../db/client.js";
import { docs, uploads } from "../../db/schema.js";
export { docs, uploads };

export async function getDocIdForUpload(docUid: string) {
  return dbGet<{ id: number; ownerId: number | null; isSuperAdminDoc: boolean }>(
    db.select({ id: docs.id, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
      .from(docs)
      .where(and(eq(docs.docUid, docUid), sql`${docs.deletedAt} IS NULL`))
      .limit(1)
  );
}

export async function getUploadByObjectKey(objectKey: string) {
  return dbGet<typeof uploads.$inferSelect>(db.select().from(uploads).where(eq(uploads.objectKey, objectKey)).limit(1));
}

export async function getUploadById(id: number) {
  return dbGet<typeof uploads.$inferSelect>(db.select().from(uploads).where(eq(uploads.id, id)).limit(1));
}

export async function insertUpload(values: {
  userId: number;
  docId: number;
  objectKey: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  kind: string;
  originalName: string;
  createdAt: Date;
}) {
  const result = await dbRun(db.insert(uploads).values(values));
  return { id: Number(result.lastInsertRowid), publicUrl: values.publicUrl };
}

export async function deleteUploadById(id: number) {
  return dbRun(db.delete(uploads).where(eq(uploads.id, id)));
}

export async function getUploadDocRef(id: number) {
  return dbGet<{ docId: number | null; ownerId: number | null; isSuperAdminDoc: boolean }>(
    db.select({ docId: uploads.docId, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
      .from(uploads)
      .leftJoin(docs, eq(docs.id, uploads.docId))
      .where(eq(uploads.id, id))
      .limit(1)
  );
}

export interface UploadQuotaResult {
  dailyCount: number;
  dailyBytes: number;
  storedBytes: number;
}

export async function getUploadQuota(userId: number, incomingBytes: number, dailyLimit: number, dailyBytesLimit: number, storedBytesLimit: number): Promise<{ ok: true } | { ok: false; reason: string; code: string }> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [daily, stored] = await Promise.all([
    dbGet<{ count: number; bytes: number }>(db.select({
      count: sql<number>`COUNT(*)`,
      bytes: sql<number>`COALESCE(SUM(${uploads.fileSize}), 0)`
    }).from(uploads).where(and(eq(uploads.userId, userId), gte(uploads.createdAt, dayStart)))),
    dbGet<{ bytes: number }>(db.select({
      bytes: sql<number>`COALESCE(SUM(${uploads.fileSize}), 0)`
    }).from(uploads).where(eq(uploads.userId, userId)))
  ]);
  if (Number(daily?.count ?? 0) >= dailyLimit) {
    return { ok: false, reason: "今日上传文件数已达上限", code: "UPLOAD_DAILY_FILE_QUOTA" };
  }
  if (Number(daily?.bytes ?? 0) + incomingBytes > dailyBytesLimit) {
    return { ok: false, reason: "今日上传流量已达上限", code: "UPLOAD_DAILY_BYTE_QUOTA" };
  }
  if (Number(stored?.bytes ?? 0) + incomingBytes > storedBytesLimit) {
    return { ok: false, reason: "存储配额不足", code: "UPLOAD_STORAGE_QUOTA" };
  }
  return { ok: true };
}
