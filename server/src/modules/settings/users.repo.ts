/**
 * users.repo.ts
 *
 * 设置-用户管理模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑、权限检查、密码处理。
 */

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import {
  authSessions,
  docCommentReactions,
  docComments,
  docs,
  docVersions,
  forms,
  invites,
  logs,
  operationLogs,
  searchHistory,
  shares,
  spaces,
  tagHierarchy,
  tags,
  templates,
  totpFailures,
  uploads,
  users
} from "../../db/schema.js";
export { authSessions, docs, docVersions, forms, invites, logs, operationLogs, shares, spaces, uploads, users };
import { now } from "../../utils/date.js";

export async function getUserById(id: number) {
  return dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, id)).limit(1));
}

export async function getUserByUsername(username: string) {
  return dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.username, username)).limit(1));
}

export async function listUsers(options: { page?: number; pageSize?: number; status?: string; role?: string } = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const conditions = [];
  if (options.status) conditions.push(eq(users.status, options.status as "active" | "disabled"));
  if (options.role) conditions.push(eq(users.role, options.role as "user" | "admin"));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countResult] = await Promise.all([
    dbAll(db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(pageSize).offset(offset)),
    dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(users).where(where)),
  ]);
  return { users: rows, total: countResult?.count ?? 0 };
}

export async function insertUser(values: {
  username: string;
  passwordHash: string;
  role: "user" | "admin";
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
}) {
  const result = await dbRun(db.insert(users).values(values));
  return { id: Number(result.lastInsertRowid) };
}

export async function updateUser(id: number, patch: Partial<typeof users.$inferInsert>) {
  await dbRun(db.update(users).set(patch).where(eq(users.id, id)));
}

export async function updateUserPassword(id: number, passwordHash: string, updatedAt: Date, executor: any = db) {
  await dbRun(executor.update(users).set({ passwordHash, updatedAt }).where(eq(users.id, id)));
}

export async function deleteUser(id: number) {
  await dbRun(db.delete(users).where(eq(users.id, id)));
}

export async function countUsers(options: { role?: string; status?: string } = {}) {
  const conditions = [];
  if (options.role) conditions.push(eq(users.role, options.role as "user" | "admin"));
  if (options.status) conditions.push(eq(users.status, options.status as "active" | "disabled"));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(users).where(where));
  return r?.count ?? 0;
}

export async function countActiveAdmins() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active"))));
  return r?.count ?? 0;
}

export async function getActiveUserCount() {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.status, "active")));
  return r?.count ?? 0;
}

export async function usernameExists(username: string) {
  const r = await dbGet<{ id: number }>(db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1));
  return !!r;
}

export async function getUserDocStats(userId: number) {
  const [total, published, deleted, shared] = await Promise.all([
    dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(docs).where(eq(docs.ownerId, userId))),
    dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(docs).where(and(eq(docs.ownerId, userId), eq(docs.status, "published")))),
    dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(docs).where(and(eq(docs.ownerId, userId), sql`${docs.deletedAt} IS NOT NULL`))),
    dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(shares).where(sql`${shares.docId} IN (SELECT id FROM ${docs} WHERE ${docs.ownerId} = ${userId})`)),
  ]);
  return {
    total: total?.count ?? 0,
    published: published?.count ?? 0,
    deleted: deleted?.count ?? 0,
    shared: shared?.count ?? 0,
  };
}

export async function getUserSpaceStats(userId: number) {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(spaces).where(eq(spaces.ownerId, userId)));
  return r?.count ?? 0;
}

export async function getUserUploadStats(userId: number) {
  const [count, totalSize] = await Promise.all([
    dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(uploads).where(eq(uploads.userId, userId))),
    dbGet<{ total: number }>(db.select({ total: sql<number>`COALESCE(SUM(${uploads.fileSize}), 0)` }).from(uploads).where(eq(uploads.userId, userId))),
  ]);
  return { count: count?.count ?? 0, totalSize: Number(totalSize?.total ?? 0) };
}

export async function getUserSessionCount(userId: number) {
  const r = await dbGet<{ count: number }>(db.select({ count: sql<number>`count(*)` }).from(authSessions).where(eq(authSessions.userId, userId)));
  return r?.count ?? 0;
}

export async function deleteUserSessions(userId: number, executor: any = db) {
  await dbRun(executor.delete(authSessions).where(eq(authSessions.userId, userId)));
}

export async function deleteUserSessionsBefore(userId: number, before: Date) {
  await dbRun(db.delete(authSessions).where(and(eq(authSessions.userId, userId), sql`${authSessions.createdAt} < ${before}`)));
}

export async function hardDeleteUserDocs(userId: number) {
  await dbRun(db.delete(docs).where(eq(docs.ownerId, userId)));
}

export async function hardDeleteUserDocVersions(userId: number) {
  await dbRun(db.delete(docVersions).where(sql`${docVersions.docId} IN (SELECT id FROM ${docs} WHERE ${docs.ownerId} = ${userId})`));
}

export async function hardDeleteUserUploads(userId: number) {
  await dbRun(db.delete(uploads).where(eq(uploads.userId, userId)));
}

export async function hardDeleteUserInvites(userId: number) {
  await dbRun(db.delete(invites).where(eq(invites.createdBy, userId)));
}

export async function hardDeleteUserLogs(userId: number) {
  await dbRun(db.delete(logs).where(eq(logs.userId, userId)));
}

export async function hardDeleteUserOperationLogs(userId: number) {
  await dbRun(db.delete(operationLogs).where(eq(operationLogs.userId, userId)));
}

export async function reassignUserDocs(targetUserId: number, newOwnerId: number, executor: any = db) {
  await dbRun(executor.update(docs).set({ ownerId: newOwnerId, ownerRole: "super_admin", scope: "admin", isSuperAdminDoc: true, visibility: "private" }).where(eq(docs.ownerId, targetUserId)));
}

export async function clearCreatedBy(targetUserId: number, executor: any = db) {
  await dbRun(executor.update(docs).set({ createdBy: null }).where(eq(docs.createdBy, targetUserId)));
}

export async function clearUpdatedBy(targetUserId: number, executor: any = db) {
  await dbRun(executor.update(docs).set({ updatedBy: null }).where(eq(docs.updatedBy, targetUserId)));
}

export async function clearInviteCreatedBy(targetUserId: number, executor: any = db) {
  await dbRun(executor.update(invites).set({ createdBy: null }).where(eq(invites.createdBy, targetUserId)));
}

export async function clearInviteUsedBy(targetUserId: number, executor: any = db) {
  await dbRun(executor.update(invites).set({ usedBy: null }).where(eq(invites.usedBy, targetUserId)));
}

export async function reassignSpacesOwner(targetUserId: number, newOwnerId: number, executor: any = db) {
  await dbRun(executor.update(spaces).set({ ownerId: newOwnerId }).where(eq(spaces.ownerId, targetUserId)));
}

export async function reassignFormsOwner(targetUserId: number, newOwnerId: number, updatedAt: Date, executor: any = db) {
  await dbRun(executor.update(forms).set({ ownerId: newOwnerId, updatedAt }).where(eq(forms.ownerId, targetUserId)));
}

export async function clearSharesRequestedBy(targetUserId: number, executor: any = db) {
  await dbRun(executor.update(shares).set({ requestedBy: null }).where(eq(shares.requestedBy, targetUserId)));
}

export async function clearSharesReviewedBy(targetUserId: number, executor: any = db) {
  await dbRun(executor.update(shares).set({ reviewedBy: null }).where(eq(shares.reviewedBy, targetUserId)));
}

export async function reassignUploadsOwner(targetUserId: number, newOwnerId: number, executor: any = db) {
  await dbRun(executor.update(uploads).set({ userId: newOwnerId }).where(eq(uploads.userId, targetUserId)));
}

export async function clearDocVersionsCreatedBy(targetUserId: number, executor: any = db) {
  await dbRun(executor.update(docVersions).set({ createdBy: null }).where(eq(docVersions.createdBy, targetUserId)));
}

export async function clearOperationLogsUserId(targetUserId: number, executor: any = db) {
  await dbRun(executor.update(operationLogs).set({ userId: null }).where(eq(operationLogs.userId, targetUserId)));
}

export async function clearLogsUserId(targetUserId: number, executor: any = db) {
  await dbRun(executor.update(logs).set({ userId: null }).where(eq(logs.userId, targetUserId)));
}

export async function reassignUserTags(targetUserId: number, newOwnerId: number, executor: any = db) {
  const [sourceTags, targetTags] = await Promise.all([
    dbAll<{ id: number; name: string }>(
      executor.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.ownerId, targetUserId))
    ),
    dbAll<{ name: string }>(
      executor.select({ name: tags.name }).from(tags).where(eq(tags.ownerId, newOwnerId))
    )
  ]);
  const targetNames = new Set(targetTags.map((tag) => tag.name));
  const duplicateIds = sourceTags.filter((tag) => targetNames.has(tag.name)).map((tag) => tag.id);
  if (duplicateIds.length) {
    await dbRun(executor.delete(tagHierarchy).where(or(
      inArray(tagHierarchy.parentTagId, duplicateIds),
      inArray(tagHierarchy.childTagId, duplicateIds)
    )));
    await dbRun(executor.delete(tags).where(inArray(tags.id, duplicateIds)));
  }
  await dbRun(executor.update(tagHierarchy).set({ ownerId: newOwnerId }).where(eq(tagHierarchy.ownerId, targetUserId)));
  await dbRun(executor.update(tags).set({ ownerId: newOwnerId }).where(eq(tags.ownerId, targetUserId)));
}

export async function reassignUserTemplates(targetUserId: number, newOwnerId: number, executor: any = db) {
  const [sourceTemplates, targetTemplates] = await Promise.all([
    dbAll<{ id: number; title: string }>(
      executor.select({ id: templates.id, title: templates.title }).from(templates).where(eq(templates.ownerId, targetUserId))
    ),
    dbAll<{ title: string }>(
      executor.select({ title: templates.title }).from(templates).where(eq(templates.ownerId, newOwnerId))
    )
  ]);
  const usedTitles = new Set(targetTemplates.map((template) => template.title));
  for (const template of sourceTemplates) {
    if (!usedTitles.has(template.title)) {
      usedTitles.add(template.title);
      continue;
    }
    const suffix = `（原用户${targetUserId}-${template.id}）`;
    const renamed = `${template.title.slice(0, Math.max(1, 191 - suffix.length))}${suffix}`;
    await dbRun(executor.update(templates).set({ title: renamed }).where(eq(templates.id, template.id)));
    usedTitles.add(renamed);
  }
  await dbRun(executor.update(templates).set({ ownerId: newOwnerId }).where(eq(templates.ownerId, targetUserId)));
}

export async function deleteUserPrivateData(targetUserId: number, executor: any = db) {
  await dbRun(executor.delete(docCommentReactions).where(eq(docCommentReactions.userId, targetUserId)));
  await dbRun(executor.delete(docComments).where(eq(docComments.userId, targetUserId)));
  await dbRun(executor.delete(totpFailures).where(eq(totpFailures.userId, targetUserId)));
  await dbRun(executor.delete(searchHistory).where(eq(searchHistory.userId, targetUserId)));
}

export async function getManagedUserRecord(userId: number) {
  return dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, userId)).limit(1));
}

export async function updateUserRole(userId: number, role: "user" | "admin", executor: any = db) {
  await dbRun(executor.update(users).set({ role, updatedAt: now() }).where(eq(users.id, userId)));
}

export async function updateUserStatus(userId: number, status: "active" | "disabled", executor: any = db) {
  await dbRun(executor.update(users).set({ status, updatedAt: now() }).where(eq(users.id, userId)));
}

export async function listManagedUsers() {
  return dbAll<typeof users.$inferSelect>(
    db.select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    })
      .from(users)
      .orderBy(desc(users.createdAt), desc(users.id))
  );
}

export async function listUserDocs(userId: number, limit = 80) {
  return dbAll(
    db.select({
      docUid: docs.docUid,
      title: docs.title,
      status: docs.status,
      deletedAt: docs.deletedAt,
      updatedAt: docs.updatedAt,
      createdAt: docs.createdAt
    })
      .from(docs)
      .where(eq(docs.ownerId, userId))
      .orderBy(desc(docs.updatedAt), desc(docs.id))
      .limit(limit)
  );
}

export async function listUserLogs(userId: number, limit = 80) {
  return dbAll(
    db.select({ ip: logs.ip, createdAt: logs.createdAt })
      .from(logs)
      .where(eq(logs.userId, userId))
      .orderBy(desc(logs.createdAt), desc(logs.id))
      .limit(limit)
  );
}

export async function getUserDocStatsMap(userIds: number[]) {
  const stats = new Map<number, { docCount: number; deletedDocCount: number }>();
  for (const id of userIds) stats.set(id, { docCount: 0, deletedDocCount: 0 });
  if (!userIds.length) return stats;
  const rows = await dbAll<{ ownerId: number | null; docCount: number; deletedDocCount: number }>(
    db
      .select({
        ownerId: docs.ownerId,
        docCount: sql<number>`COUNT(*)`,
        deletedDocCount: sql<number>`SUM(CASE WHEN ${docs.deletedAt} IS NOT NULL THEN 1 ELSE 0 END)`
      })
      .from(docs)
      .where(inArray(docs.ownerId, userIds))
      .groupBy(docs.ownerId)
  );
  for (const row of rows) {
    if (!row.ownerId) continue;
    stats.set(row.ownerId, {
      docCount: Number(row.docCount ?? 0),
      deletedDocCount: Number(row.deletedDocCount ?? 0)
    });
  }
  return stats;
}

export async function getRecentActivityMap(userIds: number[]) {
  const activity = new Map<number, { lastIp: string | null; lastActiveAt: Date | null; recentIps: string[] }>();
  for (const id of userIds) activity.set(id, { lastIp: null, lastActiveAt: null, recentIps: [] });
  if (!userIds.length) return activity;
  const rows = await dbAll<{ userId: number | null; ip: string | null; createdAt: Date }>(
    db.select({ userId: logs.userId, ip: logs.ip, createdAt: logs.createdAt })
      .from(logs)
      .where(inArray(logs.userId, userIds))
      .orderBy(desc(logs.createdAt), desc(logs.id))
      .limit(1000)
  );
  for (const row of rows) {
    if (!row.userId) continue;
    const current = activity.get(row.userId) ?? { lastIp: null, lastActiveAt: null, recentIps: [] };
    if (!current.lastActiveAt) current.lastActiveAt = row.createdAt;
    if (row.ip && !current.recentIps.includes(row.ip) && current.recentIps.length < 8) current.recentIps.push(row.ip);
    current.lastIp = current.recentIps[0] ?? null;
    activity.set(row.userId, current);
  }
  return activity;
}

export async function hardDeleteUser(userId: number, executor: any = db) {
  await dbRun(executor.delete(users).where(eq(users.id, userId)));
}
