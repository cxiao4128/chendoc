/**
 * docs.repo.ts
 *
 * 文档模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑、权限检查、加密、Schema 校验。
 */

import { and, desc, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { castAsText, databaseProvider, db, dbAll, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { docs, docVersions, shares, spaces, uploads, users } from "../../db/schema.js";
export { docs, shares };
import { now } from "../../utils/date.js";
import { generateDocUid } from "../../utils/docUid.js";

const DOC_UID_RETRY_LIMIT = 5;
const MAX_DOC_VERSIONS = 50;

export const listSelect = {
  id: docs.id,
  docUid: docs.docUid,
  spaceId: docs.spaceId,
  parentId: docs.parentId,
  title: docs.title,
  summary: docs.summary,
  tags: docs.tags,
  status: docs.status,
  pinned: docs.pinned,
  sort: docs.sort,
  ownerId: docs.ownerId,
  ownerRole: docs.ownerRole,
  scope: docs.scope,
  isSuperAdminDoc: docs.isSuperAdminDoc,
  visibility: docs.visibility,
  tenantKey: docs.tenantKey,
  createdBy: docs.createdBy,
  updatedBy: docs.updatedBy,
  ownerUsername: users.username,
  updatedAt: docs.updatedAt,
  createdAt: docs.createdAt,
  deletedAt: docs.deletedAt,
  deletedBy: docs.deletedBy,
  revision: docs.revision,
  shareCode: shares.shareCode,
  shareEnabled: shares.isEnabled,
  shareReviewStatus: shares.reviewStatus,
  customSlug: shares.customSlug
} as const;

// ============= DocUid =============

export async function findUniqueDocUid(length = 24): Promise<string> {
  for (let attempt = 0; attempt < DOC_UID_RETRY_LIMIT; attempt += 1) {
    const docUid = generateDocUid(length);
    const existing = await dbGet<{ id: number }>(
      db.select({ id: docs.id }).from(docs).where(eq(docs.docUid, docUid)).limit(1)
    );
    if (!existing) return docUid;
  }
  throw new Error("doc_uid 生成冲突，请重试");
}

// ============= Doc CRUD =============

export async function findDocById(id: number): Promise<typeof docs.$inferSelect | undefined> {
  return dbGet<typeof docs.$inferSelect>(
    db.select().from(docs).where(and(eq(docs.id, id), isNull(docs.deletedAt))).limit(1)
  );
}

export async function findDocByUid(uid: string): Promise<typeof docs.$inferSelect | undefined> {
  return dbGet<typeof docs.$inferSelect>(
    db.select().from(docs).where(and(eq(docs.docUid, uid), isNull(docs.deletedAt))).limit(1)
  );
}

export async function findDocByIdAnyStatus(id: number): Promise<typeof docs.$inferSelect | undefined> {
  return dbGet<typeof docs.$inferSelect>(db.select().from(docs).where(eq(docs.id, id)).limit(1));
}

export async function findDocByUidAnyStatus(uid: string): Promise<typeof docs.$inferSelect | undefined> {
  return dbGet<typeof docs.$inferSelect>(db.select().from(docs).where(eq(docs.docUid, uid)).limit(1));
}

export async function findDocByIdInTrash(id: number): Promise<typeof docs.$inferSelect | undefined> {
  return dbGet<typeof docs.$inferSelect>(
    db.select().from(docs).where(and(eq(docs.id, id), isNotNull(docs.deletedAt))).limit(1)
  );
}

export async function findDocsByIds(ids: number[]): Promise<typeof docs.$inferSelect[]> {
  if (!ids.length) return [];
  return dbAll<typeof docs.$inferSelect>(
    db.select().from(docs).where(inArray(docs.id, ids))
  );
}

export async function findDocsByUids(uids: string[]): Promise<typeof docs.$inferSelect[]> {
  if (!uids.length) return [];
  return dbAll<typeof docs.$inferSelect>(
    db.select().from(docs).where(inArray(docs.docUid, uids))
  );
}

export async function findDocsByUidsInTrash(uids: string[]): Promise<typeof docs.$inferSelect[]> {
  if (!uids.length) return [];
  return dbAll<typeof docs.$inferSelect>(
    db.select().from(docs).where(and(inArray(docs.docUid, uids), isNotNull(docs.deletedAt)))
  );
}

export async function findDocsByUidsNotDeleted(uids: string[]): Promise<typeof docs.$inferSelect[]> {
  if (!uids.length) return [];
  return dbAll<typeof docs.$inferSelect>(
    db.select().from(docs).where(and(inArray(docs.docUid, uids), isNull(docs.deletedAt)))
  );
}

export async function insertDoc(values: Omit<typeof docs.$inferInsert, "id">) {
  return dbRun(db.insert(docs).values(values as any));
}

export async function updateDocById(
  id: number,
  patch: Partial<typeof docs.$inferInsert>,
  whereRevision?: number
): Promise<{ changes: number }> {
  const condition = whereRevision !== undefined
    ? and(eq(docs.id, id), eq(docs.revision, whereRevision))
    : eq(docs.id, id);
  return dbRun(db.update(docs).set(patch as any).where(condition));
}

export async function updateDocsByIds(
  ids: number[],
  patch: Partial<typeof docs.$inferInsert>
): Promise<{ changes: number }> {
  if (!ids.length) return { changes: 0 };
  return dbRun(db.update(docs).set(patch as any).where(inArray(docs.id, ids)));
}

export async function softDeleteDocById(id: number, deletedBy: number): Promise<{ changes: number }> {
  return dbRun(
    db.update(docs).set({
      deletedAt: now(),
      deletedBy,
      updatedBy: deletedBy,
      updatedAt: now(),
      revision: sql`${docs.revision} + 1`
    }).where(eq(docs.id, id))
  );
}

export async function restoreDocById(id: number, updatedBy: number): Promise<{ changes: number }> {
  return dbRun(
    db.update(docs).set({
      deletedAt: null,
      deletedBy: null,
      updatedBy,
      updatedAt: now(),
      revision: sql`${docs.revision} + 1`
    }).where(eq(docs.id, id))
  );
}

export async function deleteDocById(id: number): Promise<void> {
  await dbTransaction(async (tx) => {
    await dbRun(tx.update(docs).set({ parentId: null }).where(eq(docs.parentId, id)));
    await dbRun(tx.delete(shares).where(eq(shares.docId, id)));
    await dbRun(tx.delete(docVersions).where(eq(docVersions.docId, id)));
    await dbRun(tx.update(uploads).set({ docId: null, detachedAt: now() }).where(eq(uploads.docId, id)));
    await dbRun(tx.delete(docs).where(eq(docs.id, id)));
  });
}

export async function deleteDocsByIds(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await dbTransaction(async (tx) => {
    await dbRun(tx.update(docs).set({ parentId: null }).where(inArray(docs.parentId, ids)));
    await dbRun(tx.delete(shares).where(inArray(shares.docId, ids)));
    await dbRun(tx.delete(docVersions).where(inArray(docVersions.docId, ids)));
    await dbRun(tx.update(uploads).set({ docId: null, detachedAt: now() }).where(inArray(uploads.docId, ids)));
    await dbRun(tx.delete(docs).where(inArray(docs.id, ids)));
  });
}

// ============= Doc List Query =============

function documentSearchWhere(query: string) {
  const pattern = `%${query}%`;
  const shareCodeMatch = like(castAsText(shares.shareCode), pattern);
  const customSlugMatch = like(shares.customSlug, pattern);
  if (databaseProvider === "mysql") {
    return or(
      sql`MATCH(${docs.title}, ${docs.summary}, ${docs.tags}) AGAINST (${query} IN NATURAL LANGUAGE MODE)`,
      shareCodeMatch,
      customSlugMatch
    );
  }
  return or(
    like(docs.title, pattern),
    like(docs.summary, pattern),
    like(docs.tags, pattern),
    shareCodeMatch,
    customSlugMatch
  );
}

export async function queryDocsList(opts: {
  accessWhere: any;
  query?: string;
  pageSize: number;
  offset: number;
}) {
  const where = opts.query
    ? and(opts.accessWhere, documentSearchWhere(opts.query))
    : opts.accessWhere;
  return dbAll(
    db.select(listSelect)
      .from(docs)
      .leftJoin(shares, eq(docs.id, shares.docId))
      .leftJoin(users, eq(docs.ownerId, users.id))
      .where(where)
      .orderBy(desc(docs.pinned), desc(docs.updatedAt))
      .limit(opts.pageSize + 1)
      .offset(opts.offset)
  );
}

export async function queryTrashList(opts: {
  accessWhere: any;
  pageSize: number;
  offset: number;
}) {
  return dbAll(
    db.select(listSelect)
      .from(docs)
      .leftJoin(shares, eq(docs.id, shares.docId))
      .leftJoin(users, eq(docs.ownerId, users.id))
      .where(opts.accessWhere)
      .orderBy(desc(docs.deletedAt))
      .limit(opts.pageSize + 1)
      .offset(opts.offset)
  );
}

// ============= Versions =============

export async function findLatestVersion(executor: any, docId: number) {
  const q = executor ?? db;
  return dbGet(
    q.select({
      id: docVersions.id,
      createdAt: docVersions.createdAt,
      title: docVersions.title,
      contentJsonCiphertext: docVersions.contentJsonCiphertext,
      contentJsonIv: docVersions.contentJsonIv,
      contentJsonTag: docVersions.contentJsonTag,
      contentJsonKeyVersion: docVersions.contentJsonKeyVersion,
      contentHtmlCiphertext: docVersions.contentHtmlCiphertext,
      contentHtmlIv: docVersions.contentHtmlIv,
      contentHtmlTag: docVersions.contentHtmlTag,
      contentHtmlKeyVersion: docVersions.contentHtmlKeyVersion,
    })
      .from(docVersions)
      .where(eq(docVersions.docId, docId))
      .orderBy(desc(docVersions.createdAt), desc(docVersions.id))
      .limit(1)
  );
}

export async function insertVersion(executor: any, values: {
  docId: number;
  title: string;
  contentJsonCiphertext: string | null;
  contentJsonIv: string | null;
  contentJsonTag: string | null;
  contentJsonKeyVersion: number | null;
  contentHtmlCiphertext: string | null;
  contentHtmlIv: string | null;
  contentHtmlTag: string | null;
  contentHtmlKeyVersion: number | null;
  createdBy: number;
  createdAt: Date;
}): Promise<void> {
  const q = executor ?? db;
  // In encrypted mode, plaintext content is stored in ciphertext fields.
  // The contentJson/contentHtml fields are kept for compatibility and non-encrypted docs.
  const contentJson = values.contentJsonCiphertext ? "[encrypted]" : "";
  const contentHtml = values.contentHtmlCiphertext ? "[encrypted]" : "";
  await dbRun(q.insert(docVersions).values({ ...values, contentJson, contentHtml }));
}

export async function pruneStaleVersions(executor: any, docId: number): Promise<void> {
  const q = executor ?? db;
  const stale = await dbAll<{ id: number }>(
    q.select({ id: docVersions.id })
      .from(docVersions)
      .where(eq(docVersions.docId, docId))
      .orderBy(desc(docVersions.createdAt), desc(docVersions.id))
      .limit(100_000)
      .offset(MAX_DOC_VERSIONS)
  );
  if (stale.length) {
    await dbRun(
      q.delete(docVersions).where(inArray(docVersions.id, stale.map((r) => r.id)))
    );
  }
}

export async function findVersionsByDocId(docId: number): Promise<typeof docVersions.$inferSelect[]> {
  return dbAll<typeof docVersions.$inferSelect>(
    db.select().from(docVersions)
      .where(eq(docVersions.docId, docId))
      .orderBy(desc(docVersions.createdAt), desc(docVersions.id))
      .limit(50)
  );
}

export async function findVersionById(versionId: number, docId: number) {
  return dbGet<typeof docVersions.$inferSelect>(
    db.select().from(docVersions)
      .where(and(eq(docVersions.id, versionId), eq(docVersions.docId, docId)))
      .limit(1)
  );
}

export async function findUsersByIds(ids: number[]): Promise<{ id: number; username: string }[]> {
  if (!ids.length) return [];
  return dbAll<{ id: number; username: string }>(
    db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ids))
  );
}

// ============= Share =============

export async function findShareByDocId(docId: number) {
  return dbGet<typeof shares.$inferSelect>(
    db.select().from(shares).where(eq(shares.docId, docId)).limit(1)
  );
}

export async function updateShareByDocId(docId: number, patch: Partial<typeof shares.$inferInsert>): Promise<{ changes: number }> {
  return dbRun(db.update(shares).set(patch as any).where(eq(shares.docId, docId)));
}

// ============= Space =============

export async function findSpaceById(spaceId: number) {
  return dbGet<typeof spaces.$inferSelect>(
    db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1)
  );
}

// ============= User =============

export async function findUserById(id: number) {
  return dbGet<typeof users.$inferSelect>(
    db.select().from(users).where(eq(users.id, id)).limit(1)
  );
}

// ============= Trash Stats =============

export async function queryTrashAggregate(accessWhere: any) {
  return dbGet<{ count: number; contentBytes: number; ownerCount: number }>(db
    .select({
      count: sql<number>`COUNT(*)`,
      contentBytes: sql<number>`COALESCE(SUM(
        COALESCE(LENGTH(${docs.contentJsonCiphertext}), LENGTH(${docs.contentJson}), 0) +
        COALESCE(LENGTH(${docs.contentHtmlCiphertext}), LENGTH(${docs.contentHtml}), 0) +
        COALESCE(LENGTH(${docs.title}), 0) + COALESCE(LENGTH(${docs.summary}), 0) + COALESCE(LENGTH(${docs.tags}), 0)
      ), 0)`,
      ownerCount: sql<number>`COUNT(DISTINCT ${docs.ownerId})`
    })
    .from(docs)
    .where(accessWhere));
}

export async function queryTrashUploadSize(accessWhere: any) {
  return dbGet<{ totalSize: number }>(db
    .select({ totalSize: sql<number>`COALESCE(SUM(${uploads.fileSize}), 0)` })
    .from(uploads)
    .innerJoin(docs, eq(uploads.docId, docs.id))
    .where(accessWhere));
}

export async function findOldestTrashDoc(accessWhere: any) {
  return dbGet<{ docUid: string; title: string; deletedAt: Date }>(
    db.select({ docUid: docs.docUid, title: docs.title, deletedAt: docs.deletedAt })
      .from(docs)
      .where(accessWhere)
      .orderBy(docs.deletedAt)
      .limit(1)
  );
}

// ============= Scheduled Docs =============

export async function findScheduledDocsToPublish(now: Date) {
  return dbAll<{ id: number; docUid: string }>(
    db.select({ id: docs.id, docUid: docs.docUid })
      .from(docs)
      .where(and(
        isNull(docs.deletedAt),
        isNotNull(docs.scheduledAt),
        sql`${docs.scheduledAt} <= ${now}`,
        eq(docs.status, "draft")
      ))
  );
}

export async function findExpiredDrafts(now: Date) {
  return dbAll<{ id: number; docUid: string; autoArchive: boolean }>(
    db.select({ id: docs.id, docUid: docs.docUid, autoArchive: docs.autoArchive })
      .from(docs)
      .where(and(
        isNull(docs.deletedAt),
        isNotNull(docs.expiresAt),
        sql`${docs.expiresAt} <= ${now}`,
        eq(docs.status, "draft")
      ))
  );
}

export async function publishScheduledDoc(id: number): Promise<{ changes: number }> {
  return dbRun(
    db.update(docs)
      .set({ status: "published", scheduledAt: null, updatedAt: new Date() })
      .where(eq(docs.id, id))
  );
}

export async function archiveExpiredDoc(id: number): Promise<{ changes: number }> {
  return dbRun(
    db.update(docs)
      .set({ status: "archived", expiresAt: null, updatedAt: new Date() })
      .where(eq(docs.id, id))
  );
}

export async function clearExpiredDoc(id: number): Promise<{ changes: number }> {
  return dbRun(
    db.update(docs)
      .set({ expiresAt: null, updatedAt: new Date() })
      .where(eq(docs.id, id))
  );
}

// ============= Purge =============

export async function findExpiredTrashDocs(cutoff: Date) {
  return dbAll<{ id: number }>(
    db.select({ id: docs.id })
      .from(docs)
      .where(and(isNotNull(docs.deletedAt), sql`${docs.deletedAt} <= ${cutoff}`))
  );
}

// ============= Doc Schedule =============

export async function updateDocSchedule(
  docId: number,
  updates: { scheduledAt?: Date | null; expiresAt?: Date | null; autoArchive?: boolean }
): Promise<{ changes: number }> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.scheduledAt !== undefined) patch.scheduledAt = updates.scheduledAt;
  if (updates.expiresAt !== undefined) patch.expiresAt = updates.expiresAt;
  if (updates.autoArchive !== undefined) patch.autoArchive = updates.autoArchive;
  return dbRun(db.update(docs).set(patch).where(eq(docs.id, docId)));
}

export async function findDocSchedule(docUid: string) {
  return dbGet(
    db.select({
      scheduledAt: docs.scheduledAt,
      expiresAt: docs.expiresAt,
      autoArchive: docs.autoArchive
    })
      .from(docs)
      .where(and(eq(docs.docUid, docUid), isNull(docs.deletedAt)))
      .limit(1)
  );
}

export async function findDocIdByUid(uid: string): Promise<number | undefined> {
  const doc = await dbGet<{ id: number }>(
    db.select({ id: docs.id }).from(docs).where(and(eq(docs.docUid, uid), isNull(docs.deletedAt))).limit(1)
  );
  return doc?.id;
}

export async function incrementRevision(docId: number): Promise<{ changes: number }> {
  return dbRun(db.update(docs).set({ revision: sql`${docs.revision} + 1` }).where(eq(docs.id, docId)));
}

export async function restoreDocsByIds(ids: number[], userId: number): Promise<{ changes: number }> {
  if (!ids.length) return { changes: 0 };
  return dbRun(
    db.update(docs).set({
      deletedAt: null,
      deletedBy: null,
      updatedBy: userId,
      updatedAt: now(),
      revision: sql`${docs.revision} + 1`
    }).where(inArray(docs.id, ids))
  );
}

export async function softDeleteDocsByIds(ids: number[], userId: number, deletedAt: Date): Promise<{ changes: number }> {
  if (!ids.length) return { changes: 0 };
  return dbRun(
    db.update(docs).set({
      deletedAt,
      deletedBy: userId,
      updatedBy: userId,
      updatedAt: deletedAt,
      revision: sql`${docs.revision} + 1`
    }).where(inArray(docs.id, ids))
  );
}

export async function updateDocAndShareTx(
  tx: any,
  docId: number,
  docPatch: Record<string, unknown>,
  sharePatch?: Record<string, unknown>,
  expectedRevision?: number
): Promise<{ changes: number }> {
  // 如果有 expectedRevision，需要同时检查 revision 条件并增加 revision
  if (expectedRevision !== undefined) {
    // 确保 patch 中包含新的 revision
    if (!Object.prototype.hasOwnProperty.call(docPatch, "revision")) {
      docPatch.revision = expectedRevision + 1;
    }
    const whereClause = and(eq(docs.id, docId), eq(docs.revision, expectedRevision));
    const result = await dbRun(tx.update(docs).set(docPatch as any).where(whereClause));
    if (sharePatch) {
      await dbRun(tx.update(shares).set(sharePatch as any).where(eq(shares.docId, docId)));
    }
    return result;
  }
  const result = await dbRun(tx.update(docs).set(docPatch as any).where(eq(docs.id, docId)));
  if (sharePatch) {
    await dbRun(tx.update(shares).set(sharePatch as any).where(eq(shares.docId, docId)));
  }
  return result;
}

export async function restoreVersionAtomic(
  tx: any,
  docId: number,
  docPatch: Record<string, unknown>,
  versionSnapshot: {
    docId: number;
    title: string;
    contentJsonCiphertext: string | null;
    contentJsonIv: string | null;
    contentJsonTag: string | null;
    contentJsonKeyVersion: number | null;
    contentHtmlCiphertext: string | null;
    contentHtmlIv: string | null;
    contentHtmlTag: string | null;
    contentHtmlKeyVersion: number | null;
    createdBy: number;
    createdAt: Date;
  }
): Promise<{ changes: number }> {
  await dbRun(tx.insert(docVersions).values(versionSnapshot));
  return dbRun(tx.update(docs).set(docPatch as any).where(and(eq(docs.id, docId), eq(docs.revision, docPatch.revision as number - 1))));
}

// ============= Version snapshot helpers (used by service with tx) =============

export async function shouldCreateVersion(
  executor: any,
  docId: number,
  current: { title: string; contentJson: string; contentHtml: string },
  next: { title?: string; contentJson?: string; contentHtml?: string },
  intervalMs: number
): Promise<boolean> {
  const { decryptDocumentRecord } = await import("../../utils/documentCrypto.js");
  const titleChanged = next.title !== undefined && next.title !== current.title;
  const jsonChanged = next.contentJson !== undefined && next.contentJson !== current.contentJson;
  const htmlChanged = next.contentHtml !== undefined && next.contentHtml !== current.contentHtml;
  if (!titleChanged && !jsonChanged && !htmlChanged) return false;

  const latest = await findLatestVersion(executor, docId);
  if (!latest) return true;

  const newTitle = next.title ?? current.title;
  const newContentJson = next.contentJson ?? current.contentJson;
  const newContentHtml = next.contentHtml ?? current.contentHtml;

  try {
    const latestDecrypted = decryptDocumentRecord(latest as any);
    if (latestDecrypted.title === newTitle &&
        latestDecrypted.contentJson === newContentJson &&
        latestDecrypted.contentHtml === newContentHtml) {
      return false;
    }
  } catch { /* 解密失败，按节流逻辑处理 */ }

  return Date.now() - latest.createdAt.getTime() >= intervalMs;
}

export { dbTransaction } from "../../db/client.js";
export async function createVersionSnapshotAndPrune(
  executor: any,
  docId: number,
  current: { title: string; contentJson: string; contentHtml: string },
  userId: number
): Promise<void> {
  const { encryptDocumentContent } = await import("../../utils/documentCrypto.js");
  const encrypted = encryptDocumentContent(current.contentJson, current.contentHtml);
  await insertVersion(executor, {
    docId,
    title: current.title,
    createdBy: userId,
    createdAt: now(),
    contentJsonCiphertext: encrypted.contentJsonCiphertext,
    contentJsonIv: encrypted.contentJsonIv,
    contentJsonTag: encrypted.contentJsonTag,
    contentJsonKeyVersion: encrypted.contentJsonKeyVersion != null ? Number(encrypted.contentJsonKeyVersion) : null,
    contentHtmlCiphertext: encrypted.contentHtmlCiphertext,
    contentHtmlIv: encrypted.contentHtmlIv,
    contentHtmlTag: encrypted.contentHtmlTag,
    contentHtmlKeyVersion: encrypted.contentHtmlKeyVersion != null ? Number(encrypted.contentHtmlKeyVersion) : null,
  });
  await pruneStaleVersions(executor, docId);
}
