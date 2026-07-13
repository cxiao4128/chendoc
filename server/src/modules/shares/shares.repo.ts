/**
 * shares.repo.ts
 *
 * 分享模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑、权限检查、加密、Schema 校验。
 */

import { and, eq, gte, lte, isNull, sql } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { docs, shares, users } from "../../db/schema.js";
import type { DocRecord, UserRecord } from "../docs/docs.types.js";
export { docs, shares, users };

export async function getShareByDocId(docId: number) {
  return dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.docId, docId)).limit(1));
}

export async function getShareById(id: number) {
  return dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.id, id)).limit(1));
}

export async function getShareByCode(shareCode: number) {
  return dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.shareCode, shareCode)).limit(1));
}

export async function getShareBySlug(customSlug: string) {
  return dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.customSlug, customSlug)).limit(1));
}

export async function getShareByToken(shareToken: string) {
  return dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.shareToken, shareToken)).limit(1));
}

export async function getShareByIdOrCode(idOrCode: number) {
  return dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.id, idOrCode)).limit(1));
}

export async function getDocById(docId: number) {
  return dbGet<typeof docs.$inferSelect>(db.select().from(docs).where(and(eq(docs.id, docId), isNull(docs.deletedAt))).limit(1));
}

export async function getDocByUid(docUid: string) {
  return dbGet<typeof docs.$inferSelect>(db.select().from(docs).where(and(eq(docs.docUid, docUid), isNull(docs.deletedAt))).limit(1));
}

export async function getDocWithOwner(docId: number) {
  return dbGet<{
    id: number;
    docUid: string;
    createdAt: Date;
    title: string;
    contentJson: string;
    contentHtml: string;
    contentJsonCiphertext: string | null;
    contentJsonIv: string | null;
    contentJsonTag: string | null;
    contentJsonKeyVersion: string | null;
    contentHtmlCiphertext: string | null;
    contentHtmlIv: string | null;
    contentHtmlTag: string | null;
    contentHtmlKeyVersion: string | null;
    createdBy: number | null;
    ownerId: number | null;
    deletedAt: Date | null;
    ownerRole: "user" | "doc_admin" | "super_admin" | null;
    isSuperAdminDoc: boolean;
    ownerName: string | null;
  }>(
    db.select({
      id: docs.id,
      docUid: docs.docUid,
      createdAt: docs.createdAt,
      title: docs.title,
      contentJson: docs.contentJson,
      contentHtml: docs.contentHtml,
      contentJsonCiphertext: docs.contentJsonCiphertext,
      contentJsonIv: docs.contentJsonIv,
      contentJsonTag: docs.contentJsonTag,
      contentJsonKeyVersion: docs.contentJsonKeyVersion,
      contentHtmlCiphertext: docs.contentHtmlCiphertext,
      contentHtmlIv: docs.contentHtmlIv,
      contentHtmlTag: docs.contentHtmlTag,
      contentHtmlKeyVersion: docs.contentHtmlKeyVersion,
      createdBy: docs.createdBy,
      ownerId: docs.ownerId,
      deletedAt: docs.deletedAt,
      ownerRole: docs.ownerRole,
      isSuperAdminDoc: docs.isSuperAdminDoc,
      ownerName: users.username
    })
      .from(docs)
      .leftJoin(users, eq(docs.ownerId, users.id))
      .where(and(eq(docs.id, docId), isNull(docs.deletedAt)))
      .limit(1)
  );
}

export async function insertShare(tx: any, values: {
  docId: number;
  shareCode: number;
  shareToken: string;
  customSlug: string | null;
  passwordHash: string | null;
  isEnabled: boolean;
  reviewStatus: string;
  reviewNote: string | null;
  reviewContentHash: string | null;
  requestedBy: number | null;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  expireAt: Date | null;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  const q = tx ?? db;
  const result = await dbRun(q.insert(shares).values(values));
  const created = await dbGet<typeof shares.$inferSelect>(q.select().from(shares).where(eq(shares.id, Number(result.lastInsertRowid))).limit(1));
  return created;
}

export async function updateShareById(id: number, patch: Record<string, unknown>) {
  await dbRun(db.update(shares).set(patch).where(eq(shares.id, id)));
}

export async function deleteShareById(id: number) {
  await dbRun(db.delete(shares).where(eq(shares.id, id)));
}

export async function updateShareDocVisibility(docId: number, visibility: string, updatedAt: Date) {
  await dbRun(
    db.update(docs).set({ visibility, updatedAt }).where(eq(docs.id, docId))
  );
}

export async function resetShareDocVisibility(docId: number, updatedAt: Date) {
  await dbRun(
    db.update(docs).set({ visibility: "private", updatedAt }).where(eq(docs.id, docId))
  );
}

export async function incrementShareViewCount(shareId: number, updatedAt: Date) {
  await dbRun(db.update(shares).set({ viewCount: sql`${shares.viewCount} + 1`, updatedAt }).where(eq(shares.id, shareId)));
}

export async function listUserShareReviews() {
  return dbAll(
    db.select({
      id: shares.id,
      docUid: docs.docUid,
      docTitle: docs.title,
      ownerId: docs.ownerId,
      ownerName: users.username,
      shareCode: shares.shareCode,
      customSlug: shares.customSlug,
      isEnabled: shares.isEnabled,
      reviewStatus: shares.reviewStatus,
      reviewNote: shares.reviewNote,
      hasPassword: sql<boolean>`${shares.passwordHash} is not null`,
      requestedBy: shares.requestedBy,
      reviewedBy: shares.reviewedBy,
      reviewedAt: shares.reviewedAt,
      viewCount: shares.viewCount,
      expireAt: shares.expireAt,
      createdAt: shares.createdAt,
      updatedAt: shares.updatedAt
    })
      .from(shares)
      .innerJoin(docs, eq(shares.docId, docs.id))
      .leftJoin(users, eq(docs.ownerId, users.id))
      .where(and(eq(docs.ownerRole, "user"), isNull(docs.deletedAt)))
      .orderBy(sql`case ${shares.reviewStatus} when 'pending' then 0 when 'rejected' then 1 else 2 end`, sql`${shares.updatedAt} desc`)
  );
}

export async function getPublicShareInfo(shareKey: string | number) {
  const value = String(shareKey);
  const isNumeric = /^\d+$/.test(value);
  const shareCode = isNumeric ? Number(value) : 0;
  const slug = isNumeric ? "" : value.toLowerCase();

  if (isNumeric) {
    return dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.shareCode, shareCode)).limit(1));
  }
  return dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.customSlug, slug)).limit(1));
}

export async function getPublicDocByShareKey(shareKey: string | number) {
  const value = String(shareKey);
  const isNumeric = /^\d+$/.test(value);
  const shareCode = isNumeric ? Number(value) : 0;
  const slug = isNumeric ? "" : value.toLowerCase();

  const whereClause = isNumeric
    ? sql`${shares.shareCode} = ${shareCode}`
    : sql`LOWER(${shares.customSlug}) = ${slug}`;

  return dbGet<{
    id: number;
    docUid: DocRecord["docUid"];
    ownerId: DocRecord["ownerId"];
    ownerStatus: UserRecord["status"];
    createdAt: DocRecord["createdAt"];
    title: DocRecord["title"];
    summary: DocRecord["summary"];
    coverUrl: DocRecord["coverUrl"];
    contentJson: DocRecord["contentJson"];
    contentHtml: DocRecord["contentHtml"];
    contentJsonCiphertext: DocRecord["contentJsonCiphertext"];
    contentJsonIv: DocRecord["contentJsonIv"];
    contentJsonTag: DocRecord["contentJsonTag"];
    contentJsonKeyVersion: DocRecord["contentJsonKeyVersion"];
    contentHtmlCiphertext: DocRecord["contentHtmlCiphertext"];
    contentHtmlIv: DocRecord["contentHtmlIv"];
    contentHtmlTag: DocRecord["contentHtmlTag"];
    contentHtmlKeyVersion: DocRecord["contentHtmlKeyVersion"];
    updatedAt: DocRecord["updatedAt"];
    status: DocRecord["status"];
    deletedAt: DocRecord["deletedAt"];
    ownerRole: DocRecord["ownerRole"];
  }>(
    db.select({
      id: docs.id,
      docUid: docs.docUid,
      ownerId: docs.ownerId,
      ownerStatus: users.status,
      createdAt: docs.createdAt,
      title: docs.title,
      summary: docs.summary,
      coverUrl: docs.coverUrl,
      contentJson: docs.contentJson,
      contentHtml: docs.contentHtml,
      contentJsonCiphertext: docs.contentJsonCiphertext,
      contentJsonIv: docs.contentJsonIv,
      contentJsonTag: docs.contentJsonTag,
      contentJsonKeyVersion: docs.contentJsonKeyVersion,
      contentHtmlCiphertext: docs.contentHtmlCiphertext,
      contentHtmlIv: docs.contentHtmlIv,
      contentHtmlTag: docs.contentHtmlTag,
      contentHtmlKeyVersion: docs.contentHtmlKeyVersion,
      updatedAt: docs.updatedAt,
      status: docs.status,
      deletedAt: docs.deletedAt,
      ownerRole: docs.ownerRole,
    })
      .from(docs)
      .leftJoin(users, eq(docs.ownerId, users.id))
      .where(sql`${docs.id} = (SELECT doc_id FROM shares WHERE ${whereClause} LIMIT 1)`)
      .limit(1)
  );
}

export async function assertShareCodeAvailable(shareCode: number | null | undefined, currentShareId?: number) {
  if (!shareCode) return;
  const existing = await dbGet<{ id: number }>(db.select({ id: shares.id }).from(shares).where(eq(shares.shareCode, shareCode)).limit(1));
  if (existing && existing.id !== currentShareId) throw new Error("SHARE_CODE_TAKEN");
}

export async function assertCustomSlugAvailable(customSlug: string, currentShareId?: number) {
  const lowerSlug = customSlug.toLowerCase();
  const existing = await dbGet<{ id: number }>(db.select({ id: shares.id }).from(shares).where(eq(shares.customSlug, lowerSlug)).limit(1));
  if (existing && existing.id !== currentShareId) throw new Error("CUSTOM_SLUG_TAKEN");
  const numericValue = Number(customSlug);
  if (Number.isSafeInteger(numericValue)) {
    const conflictByCode = await dbGet<{ id: number }>(db.select({ id: shares.id }).from(shares).where(eq(shares.shareCode, numericValue)).limit(1));
    if (conflictByCode && conflictByCode.id !== currentShareId) throw new Error("CUSTOM_SLUG_CONFLICTS_CODE");
  }
}

export async function nextAdminShareCode() {
  const row = await dbGet<{ code: number | null }>(
    db.select({ code: sql`max(${shares.shareCode}) as code` }).from(shares).where(and(gte(shares.shareCode, 111), lte(shares.shareCode, 9999)))
  );
  const ADMIN_CODE_MIN = 111;
  const ADMIN_CODE_MAX = 9999;
  const code = ((row?.code ?? ADMIN_CODE_MIN - 1) + 1);
  if (code <= ADMIN_CODE_MAX) return code;
  throw new Error("SHARE_CODE_EXHAUSTED");
}

export async function randomUserShareCodeExists(code: number) {
  const existing = await dbGet<{ id: number }>(db.select({ id: shares.id }).from(shares).where(eq(shares.shareCode, code)).limit(1));
  return !!existing;
}

export async function shareTokenExists(token: string, currentShareId?: number) {
  const existing = await dbGet<{ id: number }>(db.select({ id: shares.id }).from(shares).where(eq(shares.shareToken, token)).limit(1));
  return !!existing && existing.id !== currentShareId;
}
