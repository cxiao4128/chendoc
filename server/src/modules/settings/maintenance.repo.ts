/**
 * maintenance.repo.ts
 *
 * 设置-维护模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑。
 */

import { desc, eq, gte, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { authSessions, captchas, docs, docVersions, forms, invites, logs, operationLogs, settings, shares, spaces, uploads, users } from "../../db/schema.js";
export { authSessions, captchas, docs, docVersions, forms, invites, logs, operationLogs, settings, shares, spaces, uploads, users };
import { now } from "../../utils/date.js";
import { env } from "../../config/env.js";

export async function getUserCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(users));
  return r?.count ?? 0;
}

export async function getActiveUserCount(since: Date) {
  const r = await dbGet<{ count: number }>(
    db.select({ count: sql<number>`count(DISTINCT ${authSessions.userId})` })
      .from(authSessions)
      .where(gte(authSessions.createdAt, since))
  );
  return r?.count ?? 0;
}

export async function getDocCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(docs));
  return r?.count ?? 0;
}

export async function getPublishedDocCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(docs).where(eq(docs.status, "published")));
  return r?.count ?? 0;
}

export async function getDeletedDocCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(docs).where(sql`${docs.deletedAt} IS NOT NULL`));
  return r?.count ?? 0;
}

export async function getShareCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(shares));
  return r?.count ?? 0;
}

export async function getSpaceCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(spaces));
  return r?.count ?? 0;
}

export async function getUploadCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(uploads));
  return r?.count ?? 0;
}

export async function getTotalStorageBytes() {
  const r = await dbGet<{ total: number }>(db.select({ total: sql<number>`COALESCE(SUM(size), 0)` }).from(uploads));
  return Number(r?.total ?? 0);
}

export async function getFormCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(forms));
  return r?.count ?? 0;
}

export async function getInviteCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(invites));
  return r?.count ?? 0;
}

export async function getUnusedInviteCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(invites).where(eq(invites.status, "unused")));
  return r?.count ?? 0;
}

export async function getSessionCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(authSessions));
  return r?.count ?? 0;
}

export async function getExpiredSessionCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(authSessions).where(lt(authSessions.expireAt, sql`NOW()`)));
  return r?.count ?? 0;
}

export async function getOldSessionCount(before: Date) {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(authSessions).where(lt(authSessions.createdAt, before)));
  return r?.count ?? 0;
}

export async function getCaptchaCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(captchas));
  return r?.count ?? 0;
}

export async function getExpiredCaptchaCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(captchas).where(lt(captchas.expireAt, sql`NOW()`)));
  return r?.count ?? 0;
}

export async function getDocVersionCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(docVersions));
  return r?.count ?? 0;
}

export async function getOperationLogCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(operationLogs));
  return r?.count ?? 0;
}

export async function getLoginFailureCount(since: Date) {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(operationLogs).where(gte(operationLogs.createdAt, since)));
  return r?.count ?? 0;
}

export async function getRecentDocs(limit = 5) {
  return dbAll(db.select({ docUid: docs.docUid, title: docs.title, createdAt: docs.createdAt }).from(docs).orderBy(desc(docs.createdAt)).limit(limit));
}

export async function getRecentShares(limit = 5) {
  return dbAll(db.select({ id: shares.id, docId: shares.docId, shareCode: shares.shareCode, viewCount: shares.viewCount, createdAt: shares.createdAt }).from(shares).orderBy(desc(shares.createdAt)).limit(limit));
}

export async function getRecentUploads(limit = 5) {
  return dbAll(db.select({ id: uploads.id, filename: uploads.originalName, size: uploads.fileSize, createdAt: uploads.createdAt }).from(uploads).orderBy(desc(uploads.createdAt)).limit(limit));
}

export async function getRecentUsers(limit = 5) {
  return dbAll(db.select({ id: users.id, username: users.username, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(limit));
}

export async function getDbStorageStats() {
  const [tableCounts, indexSizes] = await Promise.all([
    dbAll(sql`
      SELECT
        TABLE_NAME as tableName,
        TABLE_ROWS as rowCount,
        ROUND(DATA_LENGTH / 1024, 1) as dataKb,
        ROUND(INDEX_LENGTH / 1024, 1) as indexKb
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
      LIMIT 20
    `),
    dbAll(sql`SELECT ROUND(SUM(INDEX_LENGTH) / 1024, 1) as totalIndexKb FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`),
  ]);
  return { tableCounts, totalIndexKb: indexSizes[0]?.totalIndexKb ?? 0 };
}

// getSystemOverview stats
export async function getDocStats() {
  return dbGet<any>(db.select({
    total: sql<number>`COUNT(*)`,
    trash: sql<number>`SUM(CASE WHEN ${docs.deletedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
    published: sql<number>`SUM(CASE WHEN ${docs.status} = 'published' AND ${docs.deletedAt} IS NULL THEN 1 ELSE 0 END)`
  }).from(docs));
}

export async function getUploadStats() {
  return dbGet<any>(db.select({
    total: sql<number>`COUNT(*)`,
    bytes: sql<number>`COALESCE(SUM(${uploads.fileSize}), 0)`,
    images: sql<number>`SUM(CASE WHEN ${uploads.kind} = 'image' THEN 1 ELSE 0 END)`,
    videos: sql<number>`SUM(CASE WHEN ${uploads.kind} = 'video' THEN 1 ELSE 0 END)`,
    files: sql<number>`SUM(CASE WHEN ${uploads.kind} = 'file' THEN 1 ELSE 0 END)`
  }).from(uploads));
}

export async function getShareStats() {
  return dbGet<any>(db.select({
    total: sql<number>`COUNT(*)`,
    active: sql<number>`SUM(CASE WHEN ${shares.isEnabled} = 1 THEN 1 ELSE 0 END)`,
    pending: sql<number>`SUM(CASE WHEN ${shares.reviewStatus} = 'pending' THEN 1 ELSE 0 END)`,
    protected: sql<number>`SUM(CASE WHEN ${shares.passwordHash} IS NOT NULL THEN 1 ELSE 0 END)`,
    views: sql<number>`COALESCE(SUM(${shares.viewCount}), 0)`
  }).from(shares));
}

export async function getSessionStats(now: Date) {
  // SQLite3 can only bind numbers, strings, bigints, buffers, null
  const nowTs = env.databaseProvider === "sqlite" ? now.getTime() : now;
  return dbGet<any>(db.select({
    total: sql<number>`COUNT(*)`,
    active: sql<number>`SUM(CASE WHEN ${authSessions.expireAt} > ${sql`${nowTs}`} THEN 1 ELSE 0 END)`
  }).from(authSessions));
}

export async function getCaptchaStats(now: Date) {
  // SQLite3 can only bind numbers, strings, bigints, buffers, null
  const nowTs = env.databaseProvider === "sqlite" ? now.getTime() : now;
  return dbGet<any>(db.select({
    total: sql<number>`COUNT(*)`,
    active: sql<number>`SUM(CASE WHEN ${captchas.usedAt} IS NULL AND ${captchas.expireAt} > ${sql`${nowTs}`} THEN 1 ELSE 0 END)`
  }).from(captchas));
}

export async function getLogStats(todayStart: Date, yesterdayStart: Date) {
  // SQLite3 can only bind numbers, strings, bigints, buffers, null
  const todayTs = env.databaseProvider === "sqlite" ? todayStart.getTime() : todayStart;
  const yesterdayTs = env.databaseProvider === "sqlite" ? yesterdayStart.getTime() : yesterdayStart;
  return dbGet<any>(db.select({
    today: sql<number>`SUM(CASE WHEN ${logs.createdAt} >= ${sql`${todayTs}`} THEN 1 ELSE 0 END)`,
    yesterday: sql<number>`SUM(CASE WHEN ${logs.createdAt} >= ${sql`${yesterdayTs}`} AND ${logs.createdAt} < ${sql`${todayTs}`} THEN 1 ELSE 0 END)`
  }).from(logs).where(gte(logs.createdAt, sql`${yesterdayTs}`)));
}

// emptyTrashDocs
export async function getTrashDocIds() {
  return dbAll<{ id: number }>(db.select({ id: docs.id }).from(docs).where(isNotNull(docs.deletedAt)));
}

export async function emptyTrashDocs(tx: any, trashIds: number[]) {
  await dbRun(tx.update(docs).set({ parentId: null }).where(inArray(docs.parentId, trashIds)));
  await dbRun(tx.delete(shares).where(inArray(shares.docId, trashIds)));
  await dbRun(tx.delete(docVersions).where(inArray(docVersions.docId, trashIds)));
  await dbRun(tx.update(uploads).set({ docId: null, detachedAt: now() }).where(inArray(uploads.docId, trashIds)));
  await dbRun(tx.delete(docs).where(inArray(docs.id, trashIds)));
}

// cleanup actions
export async function cleanupExpiredSessions(cutoff: Date) {
  return dbRun(db.delete(authSessions).where(lte(authSessions.expireAt, cutoff)));
}

export async function cleanupExpiredCaptchas(cutoff: Date) {
  return dbRun(db.delete(captchas).where(or(lte(captchas.expireAt, cutoff), isNotNull(captchas.usedAt))));
}

export async function cleanupExpiredLogs(cutoff: Date) {
  const [main, legacy] = await Promise.all([
    dbRun(db.delete(logs).where(lt(logs.createdAt, cutoff))),
    dbRun(db.delete(operationLogs).where(lt(operationLogs.createdAt, cutoff)))
  ]);
  return { mainChanges: main.changes, legacyChanges: legacy.changes };
}
