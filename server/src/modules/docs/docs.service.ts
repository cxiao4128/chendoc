import { and, desc, eq, inArray, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { castAsText, databaseProvider, db, dbAll, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { docs, docVersions, shares, spaces, uploads, users } from "../../db/schema.js";
import { now } from "../../utils/date.js";
import { env } from "../../config/env.js";
import { decryptDocumentRecord, encryptDocumentContent } from "../../utils/documentCrypto.js";
import { documentReviewHash } from "../../utils/documentReviewHash.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { generateDocUid } from "../../utils/docUid.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";
import { renderContentJsonToHtml, sanitizeDocumentHtml } from "../../utils/sanitize.js";
import { canAccessDocument, type DocumentAction, type DocumentActor } from "./documentAccess.js";
import { invalidateDecryptedDocCache } from "../shares/shares.service.js";
import { invalidateShareHtmlCache } from "../public/public.service.js";

type Actor = DocumentActor;
type PageOptions = { page?: number; pageSize?: number };
type DocOwnerRole = "user" | "doc_admin" | "super_admin";
type DocScope = "user" | "admin" | "system";
const VERSION_SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000; // 2 分钟内多次保存只保留一个版本
const MAX_DOC_VERSIONS = 50; // 每个文档最多保留版本数
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const DOC_UID_RETRY_LIMIT = 5;
const MAX_DOCUMENT_JSON_BYTES = 4 * 1024 * 1024;

const docCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  parentId: z.number().int().positive().nullable().optional(),
  spaceId: z.number().int().positive().nullable().optional()
});

const docUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  contentJson: z.union([z.string().max(MAX_DOCUMENT_JSON_BYTES), z.record(z.string(), z.unknown())]).optional(),
  contentHtml: z.string().max(MAX_DOCUMENT_JSON_BYTES).optional(),
  coverUrl: z.string().url().optional().nullable(),
  summary: z.string().trim().max(500).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  pinned: z.boolean().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  sort: z.number().int().optional(),
  expectedRevision: z.number().int().positive().optional()
});

function normalizeSearch(query?: unknown) {
  if (typeof query !== "string") return "";
  return query.trim().slice(0, 80);
}

function normalizeActor(actor: Actor | undefined) {
  return actor?.isSuperAdmin
    ? { ...actor, isSuperAdmin: true }
    : actor;
}

async function actorFromUserId(userId: number): Promise<Actor> {
  const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, userId)).limit(1));
  if (!user) return { id: userId, role: "user" };
  return {
    id: user.id,
    role: user.role,
    isSuperAdmin: isSuperAdminUser(user)
  };
}

function ownerRoleForActor(actor: Actor): DocOwnerRole {
  if (actor.role === "user") return "user";
  return actor.isSuperAdmin ? "super_admin" : "doc_admin";
}

function scopeForOwnerRole(ownerRole: DocOwnerRole): DocScope {
  return ownerRole === "user" ? "user" : "admin";
}

async function createUniqueDocUid(length = 24) {
  for (let attempt = 0; attempt < DOC_UID_RETRY_LIMIT; attempt += 1) {
    const docUid = generateDocUid(length);
    const existing = await dbGet<{ id: number }>(db.select({ id: docs.id }).from(docs).where(eq(docs.docUid, docUid)).limit(1));
    if (!existing) return docUid;
  }
  throw new Error("doc_uid 生成冲突，请重试");
}

async function assertCreateLocationAccess(actor: Actor, parentId?: number | null, spaceId?: number | null) {
  if (parentId) {
    const parent = await dbGet<{ ownerId: number | null; isSuperAdminDoc: boolean }>(db
      .select({ ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
      .from(docs)
      .where(and(eq(docs.id, parentId), isNull(docs.deletedAt)))
      .limit(1));
    if (!parent) throw new NotFoundError("父文档不存在", "PARENT_DOC_NOT_FOUND");
    assertCanAccessDoc(actor, parent, "update");
  }
  if (spaceId) {
    const space = await dbGet<{ ownerId: number | null }>(db
      .select({ ownerId: spaces.ownerId })
      .from(spaces)
      .where(eq(spaces.id, spaceId))
      .limit(1));
    if (!space) throw new NotFoundError("空间不存在", "SPACE_NOT_FOUND");
    if (!actor.isSuperAdmin && space.ownerId !== actor.id) throw new ForbiddenError("无权在该空间创建文档", "SPACE_FORBIDDEN");
  }
}

function docUidParam(value: string) {
  if (!/^[A-Za-z0-9]{16,32}$/.test(value)) {
    throw new BadRequestError("文档标识不正确", "INVALID_DOC_UID");
  }
  return value;
}

function accessDenied() {
  return new ForbiddenError("无权访问该文档", "DOC_FORBIDDEN");
}

function assertCanAccessDoc(actor: Actor | undefined, doc: { ownerId: number | null; isSuperAdminDoc: boolean | number }, action: DocumentAction) {
  if (!canAccessDocument(normalizeActor(actor), doc, action)) throw accessDenied();
}

function queryAccessWhere(actor: Actor, deletedCondition: any): any {
  const normalized = normalizeActor(actor)!;
  if (normalized?.isSuperAdmin) return deletedCondition;
  const base = and(deletedCondition as any, eq(docs.isSuperAdminDoc, false));
  return and(base, eq(docs.ownerId, normalized.id));
}

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

export function safeDocPayload<T extends Record<string, unknown>>(doc: T) {
  const { id: _id, ...rest } = doc;
  return rest;
}

export function safeDocListPayload<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map((row) => safeDocPayload(row));
}

function uniquePositiveIds(ids: number[]) {
  return Array.from(new Set(ids)).filter((id) => Number.isInteger(id) && id > 0);
}

function uniqueDocUids(docUids: string[]) {
  return Array.from(new Set(docUids.map((uid) => docUidParam(uid)).filter(Boolean)));
}

function normalizePageOptions(options?: PageOptions) {
  const page = Math.max(1, Math.floor(Number(options?.page) || 1));
  const rawPageSize = Math.floor(Number(options?.pageSize) || DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawPageSize));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function pagedResult<T>(rows: T[], options: ReturnType<typeof normalizePageOptions>) {
  const hasMore = rows.length > options.pageSize;
  return {
    docs: rows.slice(0, options.pageSize),
    pagination: {
      page: options.page,
      pageSize: options.pageSize,
      hasMore
    }
  };
}

function safeShareRecord(share: typeof shares.$inferSelect | undefined | null) {
  if (!share) return null;
  return {
    id: share.id,
    shareCode: share.shareCode,
    customSlug: share.customSlug,
    isEnabled: share.isEnabled,
    reviewStatus: share.reviewStatus,
    reviewNote: share.reviewNote,
    reviewContentHash: share.reviewContentHash,
    requestedBy: share.requestedBy,
    reviewedBy: share.reviewedBy,
    reviewedAt: share.reviewedAt,
    hasPassword: !!share.passwordHash,
    viewCount: share.viewCount,
    expireAt: share.expireAt,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt
  };
}

async function shouldCreateVersion(executor: any, docId: number, current: { title: string; contentJson: string; contentHtml: string }, next: { title?: string; contentJson?: string; contentHtml?: string }) {
  const titleChanged = next.title !== undefined && next.title !== current.title;
  const jsonChanged = next.contentJson !== undefined && next.contentJson !== current.contentJson;
  const htmlChanged = next.contentHtml !== undefined && next.contentHtml !== current.contentHtml;
  if (!titleChanged && !jsonChanged && !htmlChanged) return false;

  // 获取最新版本，检查内容是否完全相同（去重）
  const latest = await dbGet<{ createdAt: Date; title: string | null; contentJsonCiphertext: string | null; contentJsonIv: string | null; contentJsonTag: string | null; contentJsonKeyVersion: number | null; contentHtmlCiphertext: string | null; contentHtmlIv: string | null; contentHtmlTag: string | null; contentHtmlKeyVersion: number | null }>(executor
    .select({
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
    .limit(1));

  // 无版本记录，直接创建
  if (!latest) return true;

  // 内容去重：和最新版本完全相同则跳过
  const newTitle = next.title ?? current.title;
  const newContentJson = next.contentJson ?? current.contentJson;
  const newContentHtml = next.contentHtml ?? current.contentHtml;

  try {
    const latestDecrypted = decryptDocumentRecord(latest as any);
    if (latestDecrypted.title === newTitle &&
        latestDecrypted.contentJson === newContentJson &&
        latestDecrypted.contentHtml === newContentHtml) {
      // 内容完全相同，跳过
      return false;
    }
  } catch {
    // 解密失败，按节流逻辑处理
  }

  // 节流：检查是否在间隔时间内
  return Date.now() - latest.createdAt.getTime() >= VERSION_SNAPSHOT_INTERVAL_MS;
}

async function pruneDocVersions(executor: any, docId: number) {
  const stale = await dbAll<{ id: number }>(executor
    .select({ id: docVersions.id })
    .from(docVersions)
    .where(eq(docVersions.docId, docId))
    .orderBy(desc(docVersions.createdAt), desc(docVersions.id))
    .limit(100000)
    .offset(MAX_DOC_VERSIONS));
  if (stale.length) {
    await dbRun(executor.delete(docVersions).where(inArray(docVersions.id, stale.map((row) => row.id))));
  }
}

async function createVersionSnapshot(executor: any, docId: number, current: { title: string; contentJson: string; contentHtml: string }, userId: number) {
  const encrypted = encryptDocumentContent(current.contentJson, current.contentHtml);
  await dbRun(executor.insert(docVersions).values({
    docId,
    title: current.title,
    ...encrypted,
    createdBy: userId,
    createdAt: now()
  }));
  await pruneDocVersions(executor, docId);
}

function listSelect() {
  return {
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
  };
}

export async function listDocs(actor: Actor, query?: unknown) {
  const options = normalizePageOptions();
  return (await queryDocs(actor, query, options)).slice(0, options.pageSize);
}

async function queryDocs(actor: Actor, query?: unknown, options: ReturnType<typeof normalizePageOptions> = normalizePageOptions()) {
  const q = normalizeSearch(query);
  const accessWhere = queryAccessWhere(actor, isNull(docs.deletedAt));
  const where = q
    ? and(accessWhere, documentSearchWhere(q))
    : accessWhere;

  return (await dbAll(db
    .select(listSelect())
    .from(docs)
    .leftJoin(shares, eq(docs.id, shares.docId))
    .leftJoin(users, eq(docs.ownerId, users.id))
    .where(where)
    .orderBy(desc(docs.pinned), desc(docs.updatedAt))
    .limit(options.pageSize + 1)
    .offset(options.offset)));
}

export async function listDocsPage(actor: Actor, query?: unknown, pageOptions?: PageOptions) {
  const options = normalizePageOptions(pageOptions);
  return pagedResult(await queryDocs(actor, query, options), options);
}

export async function listTrashDocs(actor?: Actor) {
  const options = normalizePageOptions();
  return (await queryTrashDocs(actor, options)).slice(0, options.pageSize);
}

async function queryTrashDocs(actor?: Actor, options: ReturnType<typeof normalizePageOptions> = normalizePageOptions()) {
  const accessWhere = actor
    ? queryAccessWhere(actor, isNotNull(docs.deletedAt))
    : isNotNull(docs.deletedAt);
  return (await dbAll(db
    .select(listSelect())
    .from(docs)
    .leftJoin(shares, eq(docs.id, shares.docId))
    .leftJoin(users, eq(docs.ownerId, users.id))
    .where(accessWhere)
    .orderBy(desc(docs.deletedAt))
    .limit(options.pageSize + 1)
    .offset(options.offset)));
}

export async function listTrashDocsPage(actor?: Actor, pageOptions?: PageOptions) {
  const options = normalizePageOptions(pageOptions);
  return pagedResult(await queryTrashDocs(actor, options), options);
}

export async function createDoc(userId: number, input: unknown, actor?: Actor) {
  const body = docCreateSchema.parse(input);
  const creator = normalizeActor(actor) ?? await actorFromUserId(userId);
  await assertCreateLocationAccess(creator, body.parentId, body.spaceId);
  const ownerRole = ownerRoleForActor(creator);
  const docUid = await createUniqueDocUid();
  const createdAt = now();
  const encrypted = encryptDocumentContent(JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), "<p></p>");
  const result = await dbRun(db.insert(docs).values({
    docUid,
    title: body.title,
    parentId: body.parentId ?? null,
    spaceId: body.spaceId ?? null,
    ...encrypted,
    tags: "[]",
    status: "draft",
    sort: 0,
    ownerId: userId,
    ownerRole,
    createdBy: userId,
    updatedBy: userId,
    scope: scopeForOwnerRole(ownerRole),
    isSuperAdminDoc: ownerRole === "super_admin",
    visibility: "private",
    tenantKey: "default",
    createdAt,
    updatedAt: createdAt
  }));
  return await getDoc(Number(result.lastInsertRowid));
}

export async function getDoc(id: number, actor?: Actor) {
  const doc = await dbGet<typeof docs.$inferSelect>(db.select().from(docs).where(and(eq(docs.id, id), isNull(docs.deletedAt))).limit(1));
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  const decrypted = decryptDocumentRecord(doc);
  if (actor) assertCanAccessDoc(actor, decrypted, "read");
  const share = await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.docId, decrypted.id)).limit(1));
  return { ...decrypted, share: safeShareRecord(share) };
}

export async function getDocByUid(docUid: string, actor: Actor) {
  const uid = docUidParam(docUid);
  const doc = await dbGet<typeof docs.$inferSelect>(db.select().from(docs).where(and(eq(docs.docUid, uid), isNull(docs.deletedAt))).limit(1));
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  const decrypted = decryptDocumentRecord(doc);
  assertCanAccessDoc(actor, decrypted, "read");
  const share = await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.docId, decrypted.id)).limit(1));
  return { ...decrypted, share: safeShareRecord(share) };
}

async function docIdByUid(docUid: string, actor: Actor, action: DocumentAction, includeDeleted = false) {
  const uid = docUidParam(docUid);
  const where = includeDeleted ? eq(docs.docUid, uid) : and(eq(docs.docUid, uid), isNull(docs.deletedAt));
  const doc = await dbGet<{ id: number; ownerId: number | null; isSuperAdminDoc: boolean }>(db
    .select({ id: docs.id, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
    .from(docs)
    .where(where)
    .limit(1));
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  assertCanAccessDoc(actor, doc, action);
  return doc.id;
}

export async function updateDoc(id: number, userId: number, input: unknown, actor?: Actor) {
  const body = docUpdateSchema.parse(input);
  const current = await getDoc(id, actor);
  const contentJson = body.contentJson === undefined
    ? undefined
    : typeof body.contentJson === "string"
      ? body.contentJson
      : JSON.stringify(body.contentJson);
  if (contentJson !== undefined && Buffer.byteLength(contentJson, "utf8") > MAX_DOCUMENT_JSON_BYTES) {
    throw new BadRequestError("文档内容超过 4MB 限制", "DOC_CONTENT_TOO_LARGE");
  }
  const contentHtml = contentJson !== undefined
    ? renderContentJsonToHtml(contentJson)
    : body.contentHtml === undefined
      ? undefined
      : sanitizeDocumentHtml(body.contentHtml);
  const titleChanged = body.title !== undefined && body.title !== current.title;
  const jsonChanged = contentJson !== undefined && contentJson !== current.contentJson;
  const htmlChanged = contentHtml !== undefined && contentHtml !== current.contentHtml;
  const reviewRelevantChanged = titleChanged || jsonChanged || htmlChanged;

  const patch: Omit<Partial<typeof docs.$inferInsert>, "revision"> & { revision?: number | SQL<unknown> } = {
    updatedBy: userId,
    updatedAt: now(),
    revision: sql`${docs.revision} + 1`
  };
  if (body.title !== undefined) patch.title = body.title;
  if (contentJson !== undefined || contentHtml !== undefined) {
    Object.assign(patch, encryptDocumentContent(contentJson ?? current.contentJson, contentHtml ?? current.contentHtml));
  }
  if (body.coverUrl !== undefined) patch.coverUrl = body.coverUrl;
  if (body.summary !== undefined) patch.summary = body.summary;
  if (body.tags !== undefined) patch.tags = JSON.stringify(body.tags);
  if (body.pinned !== undefined) patch.pinned = body.pinned;
  if (body.status !== undefined) patch.status = body.status;
  if (body.sort !== undefined) patch.sort = body.sort;
  if (actor?.role === "user" && reviewRelevantChanged) patch.visibility = "private";

  const expectedRevision = body.expectedRevision ?? current.revision;
  await dbTransaction(async (tx) => {
    if (await shouldCreateVersion(tx, id, current, { title: body.title, contentJson, contentHtml })) {
      await createVersionSnapshot(tx, id, current, userId);
    }
    const result = await dbRun(tx.update(docs).set(patch).where(and(eq(docs.id, id), eq(docs.revision, expectedRevision))));
    if (result.changes !== 1) {
      throw new ConflictError("文档已在其他窗口更新，请刷新后合并内容", "DOC_REVISION_CONFLICT");
    }
    if (actor?.role === "user" && reviewRelevantChanged) {
      await dbRun(tx.update(shares).set({
        isEnabled: false,
        reviewStatus: "pending",
        reviewNote: null,
        reviewContentHash: documentReviewHash({
          title: body.title ?? current.title,
          contentJson: contentJson ?? current.contentJson,
          contentHtml: contentHtml ?? current.contentHtml
        }),
        requestedBy: userId,
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: now()
      }).where(eq(shares.docId, id)));
    }
  });

  // ===== 分享页秒开优化：文档更新后清除缓存 =====
  // 使用 Promise.resolve 包装以便安全调用 .catch
  Promise.resolve().then(() => invalidateShareHtmlCache(current.share?.shareCode)).catch(() => undefined);
  Promise.resolve().then(() => invalidateDecryptedDocCache(id)).catch(() => undefined);

  return await getDoc(id, actor);
}

export async function softDeleteDoc(id: number, userId: number, actor?: Actor) {
  const current = await getDoc(id, actor);
  await dbRun(db.update(docs).set({ deletedAt: now(), deletedBy: userId, updatedBy: userId, updatedAt: now(), revision: sql`${docs.revision} + 1` }).where(eq(docs.id, id)));
  return { docUid: current.docUid, ownerId: current.ownerId };
}

export async function bulkSoftDeleteDocs(ids: number[], userId: number, actor: Actor) {
  const uniqueIds = uniquePositiveIds(ids);
  const deletedIds: number[] = [];
  const deletedAt = now();

  await dbTransaction(async (tx) => {
    for (const id of uniqueIds) {
      const doc = await dbGet<{ id: number; ownerId: number | null; isSuperAdminDoc: boolean }>(tx
        .select({ id: docs.id, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
        .from(docs)
        .where(and(eq(docs.id, id), isNull(docs.deletedAt)))
        .limit(1));
      if (!doc) continue;
      assertCanAccessDoc(actor, doc, "batch");
      const result = await dbRun(tx.update(docs).set({ deletedAt, deletedBy: userId, updatedBy: userId, updatedAt: deletedAt, revision: sql`${docs.revision} + 1` }).where(eq(docs.id, id)));
      if (result.changes > 0) deletedIds.push(id);
    }
  });

  return deletedIds;
}

export async function restoreDoc(id: number, userId: number, actor?: Actor) {
  const existing = await dbGet<{ id: number; ownerId: number | null; isSuperAdminDoc: boolean }>(db
    .select({ id: docs.id, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
    .from(docs)
    .where(and(eq(docs.id, id), isNotNull(docs.deletedAt)))
    .limit(1));
  if (!existing) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  if (actor) assertCanAccessDoc(actor, existing, "restore");
  await dbRun(db.update(docs).set({ deletedAt: null, deletedBy: null, updatedBy: userId, updatedAt: now(), revision: sql`${docs.revision} + 1` }).where(eq(docs.id, id)));
  return await getDoc(id, actor);
}

export async function bulkRestoreDocs(ids: number[], userId: number, actor?: Actor) {
  const uniqueIds = uniquePositiveIds(ids);
  if (!uniqueIds.length) return [];

  const rows = await dbAll<{ id: number; ownerId: number | null; isSuperAdminDoc: boolean }>(db
    .select({ id: docs.id, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
    .from(docs)
    .where(and(inArray(docs.id, uniqueIds), isNotNull(docs.deletedAt))));
  const restoredIds = rows.filter((row) => canAccessDocument(normalizeActor(actor), row, "batch")).map((row) => row.id);
  if (!restoredIds.length) return [];

  const updatedAt = now();
  await dbRun(db.update(docs).set({ deletedAt: null, deletedBy: null, updatedBy: userId, updatedAt, revision: sql`${docs.revision} + 1` }).where(inArray(docs.id, restoredIds)));
  return restoredIds;
}

export async function hardDeleteDoc(id: number, actor?: Actor) {
  const existing = await dbGet<{ id: number; ownerId: number | null; isSuperAdminDoc: boolean }>(db
    .select({ id: docs.id, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
    .from(docs)
    .where(and(eq(docs.id, id), isNotNull(docs.deletedAt)))
    .limit(1));
  if (!existing) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  if (actor) assertCanAccessDoc(actor, existing, "permanent_delete");
  await dbTransaction(async (tx) => {
    await dbRun(tx.update(docs).set({ parentId: null }).where(eq(docs.parentId, id)));
    await dbRun(tx.delete(shares).where(eq(shares.docId, id)));
    await dbRun(tx.delete(docVersions).where(eq(docVersions.docId, id)));
    await dbRun(tx.update(uploads).set({ docId: null, detachedAt: now() }).where(eq(uploads.docId, id)));
    await dbRun(tx.delete(docs).where(eq(docs.id, id)));
  });
}

export async function bulkHardDeleteTrashDocs(ids: number[], actor?: Actor) {
  const uniqueIds = uniquePositiveIds(ids);
  if (!uniqueIds.length) return [];

  const rows = await dbAll<{ id: number; ownerId: number | null; isSuperAdminDoc: boolean }>(db
    .select({ id: docs.id, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
    .from(docs)
    .where(and(inArray(docs.id, uniqueIds), isNotNull(docs.deletedAt))));
  const deletedIds = rows.filter((row) => canAccessDocument(normalizeActor(actor), row, "batch")).map((row) => row.id);
  if (!deletedIds.length) return [];

  await dbTransaction(async (tx) => {
    await dbRun(tx.update(docs).set({ parentId: null }).where(inArray(docs.parentId, deletedIds)));
    await dbRun(tx.delete(shares).where(inArray(shares.docId, deletedIds)));
    await dbRun(tx.delete(docVersions).where(inArray(docVersions.docId, deletedIds)));
    await dbRun(tx.update(uploads).set({ docId: null, detachedAt: now() }).where(inArray(uploads.docId, deletedIds)));
    await dbRun(tx.delete(docs).where(inArray(docs.id, deletedIds)));
  });

  return deletedIds;
}

async function accessibleDocsByUids(docUids: string[], actor: Actor, action: DocumentAction, deleted: "active" | "trash") {
  const uids = uniqueDocUids(docUids);
  if (!uids.length) return [];
  const deletedWhere = deleted === "trash" ? isNotNull(docs.deletedAt) : isNull(docs.deletedAt);
  const rows = await dbAll<{ id: number; docUid: string; ownerId: number | null; isSuperAdminDoc: boolean }>(db
    .select({ id: docs.id, docUid: docs.docUid, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
    .from(docs)
    .where(and(inArray(docs.docUid, uids), deletedWhere)));
  return rows.filter((row) => canAccessDocument(normalizeActor(actor), row, action));
}

export async function updateDocByUid(docUid: string, userId: number, input: unknown, actor: Actor) {
  const id = await docIdByUid(docUid, actor, "update");
  return await updateDoc(id, userId, input, actor);
}

export async function softDeleteDocByUid(docUid: string, userId: number, actor: Actor) {
  const id = await docIdByUid(docUid, actor, "delete");
  return await softDeleteDoc(id, userId, actor);
}

export async function bulkSoftDeleteDocsByUid(docUids: string[], userId: number, actor: Actor) {
  const rows = await accessibleDocsByUids(docUids, actor, "batch", "active");
  if (!rows.length) return [];
  const deletedAt = now();
  const ids = rows.map((row) => row.id);
  await dbRun(db.update(docs).set({ deletedAt, deletedBy: userId, updatedBy: userId, updatedAt: deletedAt, revision: sql`${docs.revision} + 1` }).where(inArray(docs.id, ids)));
  return rows.map((row) => row.docUid);
}

export async function restoreDocByUid(docUid: string, userId: number, actor: Actor) {
  const id = await docIdByUid(docUid, actor, "restore", true);
  return await restoreDoc(id, userId, actor);
}

export async function bulkRestoreDocsByUid(docUids: string[], userId: number, actor: Actor) {
  const rows = await accessibleDocsByUids(docUids, actor, "batch", "trash");
  if (!rows.length) return [];
  const updatedAt = now();
  const ids = rows.map((row) => row.id);
  await dbRun(db.update(docs).set({ deletedAt: null, deletedBy: null, updatedBy: userId, updatedAt, revision: sql`${docs.revision} + 1` }).where(inArray(docs.id, ids)));
  return rows.map((row) => row.docUid);
}

export async function hardDeleteDocByUid(docUid: string, actor: Actor) {
  const id = await docIdByUid(docUid, actor, "permanent_delete", true);
  await hardDeleteDoc(id, actor);
}

export async function bulkHardDeleteTrashDocsByUid(docUids: string[], actor: Actor) {
  const rows = await accessibleDocsByUids(docUids, actor, "batch", "trash");
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  await dbTransaction(async (tx) => {
    await dbRun(tx.update(docs).set({ parentId: null }).where(inArray(docs.parentId, ids)));
    await dbRun(tx.delete(shares).where(inArray(shares.docId, ids)));
    await dbRun(tx.delete(docVersions).where(inArray(docVersions.docId, ids)));
    await dbRun(tx.update(uploads).set({ docId: null, detachedAt: now() }).where(inArray(uploads.docId, ids)));
    await dbRun(tx.delete(docs).where(inArray(docs.id, ids)));
  });
  return rows.map((row) => row.docUid);
}

export async function publishDocByUid(docUid: string, userId: number, actor: Actor) {
  const id = await docIdByUid(docUid, actor, "update");
  return await publishDoc(id, userId, actor);
}

export async function publishDoc(id: number, userId: number, actor?: Actor) {
  if (actor) await getDoc(id, actor);
  await dbRun(db.update(docs).set({ status: "published", updatedBy: userId, updatedAt: now() }).where(eq(docs.id, id)));
  return await getDoc(id, actor);
}

export async function listDocVersions(docId: number, actor?: Actor) {
  const current = await getDoc(docId, actor);
  const rows = await dbAll<typeof docVersions.$inferSelect>(db
    .select()
    .from(docVersions)
    .where(eq(docVersions.docId, docId))
    .orderBy(desc(docVersions.createdAt), desc(docVersions.id))
    .limit(50));
  const userIds = Array.from(new Set(rows.map((row) => row.createdBy).filter((id): id is number => !!id)));
  const authors = userIds.length
    ? await dbAll<{ id: number; username: string }>(db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, userIds)))
    : [];
  const authorMap = new Map(authors.map((author) => [author.id, author.username]));
  const currentWordCount = plainTextFromHtml(current.contentHtml).length;
  return rows.map((row) => {
    const version = decryptDocumentRecord(row);
    const wordCount = plainTextFromHtml(version.contentHtml).length;
    const delta = wordCount - currentWordCount;
    return {
      id: row.id,
      title: version.title,
      wordCount,
      authorName: row.createdBy ? authorMap.get(row.createdBy) || `用户 #${row.createdBy}` : "系统",
      diffSummary: `${version.title === current.title ? "标题未变" : "标题有修改"} · 较当前${delta === 0 ? "字数相同" : `${delta > 0 ? "+" : ""}${delta} 字`}`,
      createdBy: row.createdBy,
      createdAt: row.createdAt
    };
  });
}

export async function listDocVersionsByUid(docUid: string, actor: Actor) {
  const id = await docIdByUid(docUid, actor, "history");
  return await listDocVersions(id, actor);
}

function plainTextFromHtml(value: string) {
  return value.replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getDocVersionPreviewByUid(docUid: string, versionId: number, actor: Actor) {
  const docId = await docIdByUid(docUid, actor, "history");
  const row = await dbGet<typeof docVersions.$inferSelect>(db.select().from(docVersions)
    .where(and(eq(docVersions.id, versionId), eq(docVersions.docId, docId))).limit(1));
  if (!row) throw new NotFoundError("版本不存在", "VERSION_NOT_FOUND");
  const version = decryptDocumentRecord(row);
  return {
    id: row.id,
    title: version.title,
    contentText: plainTextFromHtml(version.contentHtml),
    wordCount: plainTextFromHtml(version.contentHtml).length,
    createdBy: row.createdBy,
    createdAt: row.createdAt
  };
}

export async function restoreDocVersionAsCopyByUid(docUid: string, versionId: number, userId: number, actor: Actor) {
  const previewDocId = await docIdByUid(docUid, actor, "history");
  const row = await dbGet<typeof docVersions.$inferSelect>(db.select().from(docVersions)
    .where(and(eq(docVersions.id, versionId), eq(docVersions.docId, previewDocId))).limit(1));
  if (!row) throw new NotFoundError("版本不存在", "VERSION_NOT_FOUND");
  const version = decryptDocumentRecord(row);
  const copy = await createDoc(userId, { title: `${version.title}（恢复副本）` }, actor);
  return await updateDoc(copy.id, userId, {
    title: `${version.title}（恢复副本）`,
    contentJson: version.contentJson,
    contentHtml: version.contentHtml,
    summary: `从历史版本恢复，原文档 ${docUid}`
  }, actor);
}

export async function restoreDocVersion(docId: number, versionId: number, userId: number, actor?: Actor) {
  const current = await getDoc(docId, actor);
  const version = await dbGet<typeof docVersions.$inferSelect>(db
    .select()
    .from(docVersions)
    .where(and(eq(docVersions.id, versionId), eq(docVersions.docId, docId)))
    .limit(1));
  if (!version) throw new NotFoundError("版本不存在", "VERSION_NOT_FOUND");
  const decryptedVersion = decryptDocumentRecord(version);
  const encrypted = encryptDocumentContent(decryptedVersion.contentJson, decryptedVersion.contentHtml);
  await dbTransaction(async (tx) => {
    await createVersionSnapshot(tx, docId, current, userId);
    const result = await dbRun(tx.update(docs).set({
      title: decryptedVersion.title,
      ...encrypted,
      updatedBy: userId,
      updatedAt: now(),
      revision: sql`${docs.revision} + 1`
    }).where(and(eq(docs.id, docId), eq(docs.revision, current.revision))));
    if (result.changes !== 1) throw new ConflictError("文档已在其他窗口更新，请刷新后重试", "DOC_REVISION_CONFLICT");
    if (actor?.role === "user") {
      await dbRun(tx.update(shares).set({
        isEnabled: false,
        reviewStatus: "pending",
        reviewNote: null,
        reviewContentHash: documentReviewHash(decryptedVersion),
        requestedBy: userId,
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: now()
      }).where(eq(shares.docId, docId)));
    }
  });
  return await getDoc(docId, actor);
}

export async function restoreDocVersionByUid(docUid: string, versionId: number, userId: number, actor: Actor) {
  const id = await docIdByUid(docUid, actor, "history");
  return await restoreDocVersion(id, versionId, userId, actor);
}

// ===== 回收站统计 =====
export interface TrashStats {
  trashCount: number;
  storageUsedBytes: number;
  storageTotalBytes: number;
  oldestDeletedAt: string | null;
  oldestDeletedDocUid: string | null;
  oldestDeletedTitle: string | null;
  retentionDays: number;
}

export async function getTrashStats(actor: Actor): Promise<TrashStats> {
  const accessWhere = queryAccessWhere(actor, isNotNull(docs.deletedAt));
  const [aggregate, uploadAggregate, oldest] = await Promise.all([
    dbGet<{ count: number; contentBytes: number; ownerCount: number }>(db
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
      .where(accessWhere)),
    dbGet<{ totalSize: number }>(db
      .select({ totalSize: sql<number>`COALESCE(SUM(${uploads.fileSize}), 0)` })
      .from(uploads)
      .innerJoin(docs, eq(uploads.docId, docs.id))
      .where(accessWhere)),
    dbGet<{ docUid: string; title: string; deletedAt: Date }>(db
      .select({ docUid: docs.docUid, title: docs.title, deletedAt: docs.deletedAt })
      .from(docs)
      .where(accessWhere)
      .orderBy(docs.deletedAt)
      .limit(1))
  ]);

  const storageUsedBytes = Number(aggregate?.contentBytes ?? 0) + Number(uploadAggregate?.totalSize ?? 0);
  const ownerCount = Math.max(1, Number(aggregate?.ownerCount ?? 0));

  return {
    trashCount: Number(aggregate?.count ?? 0),
    storageUsedBytes,
    storageTotalBytes: env.uploadQuota.storedBytesPerUser * ownerCount,
    oldestDeletedAt: oldest?.deletedAt?.toISOString() ?? null,
    oldestDeletedDocUid: oldest?.docUid ?? null,
    oldestDeletedTitle: oldest?.title ?? null,
    retentionDays: env.trashRetentionDays
  };
}

export async function purgeExpiredTrashDocs() {
  const cutoff = new Date(Date.now() - env.trashRetentionDays * 86_400_000);
  const rows = await dbAll<{ id: number }>(db
    .select({ id: docs.id })
    .from(docs)
    .where(and(isNotNull(docs.deletedAt), sql`${docs.deletedAt} <= ${cutoff}`)));
  if (!rows.length) return 0;
  return (await bulkHardDeleteTrashDocs(rows.map((row) => row.id), { id: 0, role: "admin", isSuperAdmin: true })).length;
}

// ===== 定时发布和草稿过期 =====
export interface ScheduleInfo {
  scheduledAt: Date | null;
  expiresAt: Date | null;
  autoArchive: boolean;
}

// 设置文档定时发布
export async function setDocumentSchedule(
  actor: Actor,
  docUid: string,
  input: {
    scheduledAt?: string | null;
    expiresAt?: string | null;
    autoArchive?: boolean;
  }
): Promise<ScheduleInfo> {
  const doc = await dbGet<{ id: number; ownerId: number; isSuperAdminDoc: boolean }>(
    db.select({ id: docs.id, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
      .from(docs)
      .where(and(eq(docs.docUid, docUid), isNull(docs.deletedAt)))
      .limit(1)
  );
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  assertCanAccessDoc(actor, doc, "update");

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (input.scheduledAt !== undefined) {
    updates.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  }
  if (input.expiresAt !== undefined) {
    updates.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  }
  if (input.autoArchive !== undefined) {
    updates.autoArchive = input.autoArchive;
  }

  await dbRun(db.update(docs).set(updates).where(eq(docs.id, doc.id)));

  const updated = await dbGet<ScheduleInfo>(
    db.select({
      scheduledAt: docs.scheduledAt,
      expiresAt: docs.expiresAt,
      autoArchive: docs.autoArchive
    })
      .from(docs)
      .where(eq(docs.id, doc.id))
      .limit(1)
  );

  return {
    scheduledAt: updated?.scheduledAt ?? null,
    expiresAt: updated?.expiresAt ?? null,
    autoArchive: updated?.autoArchive ?? false
  };
}

// 获取文档定时信息
export async function getDocumentSchedule(docUid: string): Promise<ScheduleInfo | null> {
  const doc = await dbGet<ScheduleInfo>(
    db.select({
      scheduledAt: docs.scheduledAt,
      expiresAt: docs.expiresAt,
      autoArchive: docs.autoArchive
    })
      .from(docs)
      .where(and(eq(docs.docUid, docUid), isNull(docs.deletedAt)))
      .limit(1)
  );
  if (!doc) return null;
  return {
    scheduledAt: doc.scheduledAt,
    expiresAt: doc.expiresAt,
    autoArchive: doc.autoArchive
  };
}

// 处理定时发布的文档（定时任务调用）
export async function processScheduledDocs() {
  const now = new Date();
  const rows = await dbAll<{ id: number; docUid: string }>(
    db.select({ id: docs.id, docUid: docs.docUid })
      .from(docs)
      .where(and(
        isNull(docs.deletedAt),
        isNotNull(docs.scheduledAt),
        sql`${docs.scheduledAt} <= ${now}`,
        eq(docs.status, "draft")
      ))
  );

  if (!rows.length) return { published: 0 };

  const actor: Actor = { id: 0, role: "admin", isSuperAdmin: true };
  let published = 0;

  for (const row of rows) {
    try {
      await dbRun(
        db.update(docs)
          .set({
            status: "published",
            scheduledAt: null,
            updatedAt: new Date()
          })
          .where(eq(docs.id, row.id))
      );
      published++;
    } catch (error) {
      console.error(`Failed to publish scheduled doc ${row.docUid}:`, error);
    }
  }

  return { published };
}

// 处理过期的草稿（定时任务调用）
export async function processExpiredDrafts() {
  const now = new Date();
  const rows = await dbAll<{ id: number; docUid: string; autoArchive: boolean }>(
    db.select({ id: docs.id, docUid: docs.docUid, autoArchive: docs.autoArchive })
      .from(docs)
      .where(and(
        isNull(docs.deletedAt),
        isNotNull(docs.expiresAt),
        sql`${docs.expiresAt} <= ${now}`,
        eq(docs.status, "draft")
      ))
  );

  if (!rows.length) return { expired: 0, archived: 0 };

  let expired = 0;
  let archived = 0;

  for (const row of rows) {
    try {
      if (row.autoArchive) {
        // 过期后归档
        await dbRun(
          db.update(docs)
            .set({
              status: "archived",
              expiresAt: null,
              updatedAt: new Date()
            })
            .where(eq(docs.id, row.id))
        );
        archived++;
      } else {
        // 仅标记过期
        await dbRun(
          db.update(docs)
            .set({
              expiresAt: null,
              updatedAt: new Date()
            })
            .where(eq(docs.id, row.id))
        );
      }
      expired++;
    } catch (error) {
      console.error(`Failed to process expired draft ${row.docUid}:`, error);
    }
  }

  return { expired, archived };
}
