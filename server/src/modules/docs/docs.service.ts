import { and, desc, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { castAsText, db, dbAll, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { docs, docVersions, shares, uploads, users } from "../../db/schema.js";
import { now } from "../../utils/date.js";
import { decryptDocumentRecord, encryptDocumentContent } from "../../utils/documentCrypto.js";
import { documentReviewHash } from "../../utils/documentReviewHash.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
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
const VERSION_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
const MAX_DOC_VERSIONS = 50;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const DOC_UID_RETRY_LIMIT = 5;

const docCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  parentId: z.number().int().positive().nullable().optional(),
  spaceId: z.number().int().positive().nullable().optional()
});

const docUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  contentJson: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  contentHtml: z.string().optional(),
  coverUrl: z.string().url().optional().nullable(),
  summary: z.string().trim().max(500).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  pinned: z.boolean().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  sort: z.number().int().optional()
});

function normalizeSearch(query?: unknown) {
  if (typeof query !== "string") return "";
  return query.trim().slice(0, 80);
}

let didNormalizeLegacyDraftStatuses = false;

async function normalizeLegacyDraftStatuses() {
  if (didNormalizeLegacyDraftStatuses) return;
  await dbRun(db.update(docs).set({ status: "published" }).where(eq(docs.status, "draft")));
  didNormalizeLegacyDraftStatuses = true;
}

function normalizeDocStatus(status: "draft" | "published" | "archived") {
  return status === "archived" ? "archived" : "published";
}

function normalizeDocRecord<T extends { status: "draft" | "published" | "archived" }>(doc: T): T {
  return { ...doc, status: normalizeDocStatus(doc.status) };
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
  if (normalized.role === "admin") return base;
  return and(base, eq(docs.ownerId, normalized.id));
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

async function shouldCreateVersion(docId: number, current: { title: string; contentJson: string; contentHtml: string }, next: { title?: string; contentJson?: string; contentHtml?: string }) {
  const titleChanged = next.title !== undefined && next.title !== current.title;
  const jsonChanged = next.contentJson !== undefined && next.contentJson !== current.contentJson;
  const htmlChanged = next.contentHtml !== undefined && next.contentHtml !== current.contentHtml;
  if (!titleChanged && !jsonChanged && !htmlChanged) return false;

  const latest = await dbGet<{ createdAt: Date }>(db
    .select({ createdAt: docVersions.createdAt })
    .from(docVersions)
    .where(eq(docVersions.docId, docId))
    .orderBy(desc(docVersions.createdAt), desc(docVersions.id))
    .limit(1));
  if (!latest) return true;
  return Date.now() - latest.createdAt.getTime() >= VERSION_SNAPSHOT_INTERVAL_MS;
}

async function pruneDocVersions(docId: number) {
  const stale = await dbAll<{ id: number }>(db
    .select({ id: docVersions.id })
    .from(docVersions)
    .where(eq(docVersions.docId, docId))
    .orderBy(desc(docVersions.createdAt), desc(docVersions.id))
    .limit(100000)
    .offset(MAX_DOC_VERSIONS));
  if (stale.length) {
    await dbRun(db.delete(docVersions).where(inArray(docVersions.id, stale.map((row) => row.id))));
  }
}

async function createVersionSnapshot(docId: number, current: { title: string; contentJson: string; contentHtml: string }, userId: number) {
  const encrypted = encryptDocumentContent(current.contentJson, current.contentHtml);
  await dbRun(db.insert(docVersions).values({
    docId,
    title: current.title,
    ...encrypted,
    createdBy: userId,
    createdAt: now()
  }));
  await pruneDocVersions(docId);
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
  await normalizeLegacyDraftStatuses();
  const q = normalizeSearch(query);
  const pattern = `%${q}%`;
  const accessWhere = queryAccessWhere(actor, isNull(docs.deletedAt));
  const where = q
    ? and(
      accessWhere,
      or(
        like(docs.title, pattern),
        like(docs.summary, pattern),
        like(castAsText(shares.shareCode), pattern),
        like(shares.customSlug, pattern)
      )
    )
    : accessWhere;

  return (await dbAll(db
    .select(listSelect())
    .from(docs)
    .leftJoin(shares, eq(docs.id, shares.docId))
    .leftJoin(users, eq(docs.createdBy, users.id))
    .where(where)
    .orderBy(desc(docs.pinned), desc(docs.updatedAt))
    .limit(options.pageSize + 1)
    .offset(options.offset)))
    .map((doc: any) => normalizeDocRecord(doc));
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
  await normalizeLegacyDraftStatuses();
  const accessWhere = actor
    ? queryAccessWhere(actor, isNotNull(docs.deletedAt))
    : isNotNull(docs.deletedAt);
  return (await dbAll(db
    .select(listSelect())
    .from(docs)
    .leftJoin(shares, eq(docs.id, shares.docId))
    .leftJoin(users, eq(docs.createdBy, users.id))
    .where(accessWhere)
    .orderBy(desc(docs.deletedAt))
    .limit(options.pageSize + 1)
    .offset(options.offset)))
    .map((doc: any) => normalizeDocRecord(doc));
}

export async function listTrashDocsPage(actor?: Actor, pageOptions?: PageOptions) {
  const options = normalizePageOptions(pageOptions);
  return pagedResult(await queryTrashDocs(actor, options), options);
}

export async function createDoc(userId: number, input: unknown, actor?: Actor) {
  const body = docCreateSchema.parse(input);
  const creator = normalizeActor(actor) ?? await actorFromUserId(userId);
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
    status: "published",
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
  await normalizeLegacyDraftStatuses();
  const doc = await dbGet<typeof docs.$inferSelect>(db.select().from(docs).where(and(eq(docs.id, id), isNull(docs.deletedAt))).limit(1));
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  const decrypted = decryptDocumentRecord(doc);
  if (actor) assertCanAccessDoc(actor, decrypted, "read");
  const share = await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.docId, decrypted.id)).limit(1));
  return { ...normalizeDocRecord(decrypted), share: safeShareRecord(share) };
}

export async function getDocByUid(docUid: string, actor: Actor) {
  await normalizeLegacyDraftStatuses();
  const uid = docUidParam(docUid);
  const doc = await dbGet<typeof docs.$inferSelect>(db.select().from(docs).where(and(eq(docs.docUid, uid), isNull(docs.deletedAt))).limit(1));
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  const decrypted = decryptDocumentRecord(doc);
  assertCanAccessDoc(actor, decrypted, "read");
  const share = await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.docId, decrypted.id)).limit(1));
  return { ...normalizeDocRecord(decrypted), share: safeShareRecord(share) };
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
  const contentHtml = contentJson !== undefined
    ? renderContentJsonToHtml(contentJson)
    : body.contentHtml === undefined
      ? undefined
      : sanitizeDocumentHtml(body.contentHtml);
  const titleChanged = body.title !== undefined && body.title !== current.title;
  const jsonChanged = contentJson !== undefined && contentJson !== current.contentJson;
  const htmlChanged = contentHtml !== undefined && contentHtml !== current.contentHtml;
  const reviewRelevantChanged = titleChanged || jsonChanged || htmlChanged;

  if (await shouldCreateVersion(id, current, { title: body.title, contentJson, contentHtml })) {
    await createVersionSnapshot(id, current, userId);
  }

  const patch: Partial<typeof docs.$inferInsert> = {
    updatedBy: userId,
    updatedAt: now()
  };
  if (body.title !== undefined) patch.title = body.title;
  if (contentJson !== undefined || contentHtml !== undefined) {
    Object.assign(patch, encryptDocumentContent(contentJson ?? current.contentJson, contentHtml ?? current.contentHtml));
  }
  if (body.coverUrl !== undefined) patch.coverUrl = body.coverUrl;
  if (body.summary !== undefined) patch.summary = body.summary;
  if (body.tags !== undefined) patch.tags = JSON.stringify(body.tags);
  if (body.pinned !== undefined) patch.pinned = body.pinned;
  if (body.status !== undefined) patch.status = normalizeDocStatus(body.status);
  if (body.sort !== undefined) patch.sort = body.sort;
  if (actor?.role === "user" && reviewRelevantChanged) patch.visibility = "private";

  await dbRun(db.update(docs).set(patch).where(eq(docs.id, id)));
  if (actor?.role === "user" && reviewRelevantChanged) {
    await dbRun(db.update(shares).set({
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

  // ===== 分享页秒开优化：文档更新后清除缓存 =====
  // 使用 Promise.resolve 包装以便安全调用 .catch
  Promise.resolve().then(() => invalidateShareHtmlCache()).catch(() => undefined);
  Promise.resolve().then(() => invalidateDecryptedDocCache(id)).catch(() => undefined);

  return await getDoc(id, actor);
}

export async function softDeleteDoc(id: number, userId: number, actor?: Actor) {
  const current = await getDoc(id, actor);
  await dbRun(db.update(docs).set({ deletedAt: now(), updatedBy: userId, updatedAt: now() }).where(eq(docs.id, id)));
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
      const result = await dbRun(tx.update(docs).set({ deletedAt, updatedBy: userId, updatedAt: deletedAt }).where(eq(docs.id, id)));
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
  await dbRun(db.update(docs).set({ deletedAt: null, updatedBy: userId, updatedAt: now() }).where(eq(docs.id, id)));
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
  await dbRun(db.update(docs).set({ deletedAt: null, updatedBy: userId, updatedAt }).where(inArray(docs.id, restoredIds)));
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
    await dbRun(tx.delete(shares).where(eq(shares.docId, id)));
    await dbRun(tx.delete(docVersions).where(eq(docVersions.docId, id)));
    await dbRun(tx.update(uploads).set({ docId: null }).where(eq(uploads.docId, id)));
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
    await dbRun(tx.delete(shares).where(inArray(shares.docId, deletedIds)));
    await dbRun(tx.delete(docVersions).where(inArray(docVersions.docId, deletedIds)));
    await dbRun(tx.update(uploads).set({ docId: null }).where(inArray(uploads.docId, deletedIds)));
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
  await dbRun(db.update(docs).set({ deletedAt, updatedBy: userId, updatedAt: deletedAt }).where(inArray(docs.id, ids)));
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
  await dbRun(db.update(docs).set({ deletedAt: null, updatedBy: userId, updatedAt }).where(inArray(docs.id, ids)));
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
    await dbRun(tx.delete(shares).where(inArray(shares.docId, ids)));
    await dbRun(tx.delete(docVersions).where(inArray(docVersions.docId, ids)));
    await dbRun(tx.update(uploads).set({ docId: null }).where(inArray(uploads.docId, ids)));
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
  await createVersionSnapshot(docId, current, userId);
  await dbRun(db.update(docs).set({
    title: decryptedVersion.title,
    ...encrypted,
    updatedBy: userId,
    updatedAt: now()
  }).where(eq(docs.id, docId)));
  if (actor?.role === "user") {
    await dbRun(db.update(shares).set({
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
  return await getDoc(docId, actor);
}

export async function restoreDocVersionByUid(docUid: string, versionId: number, userId: number, actor: Actor) {
  const id = await docIdByUid(docUid, actor, "history");
  return await restoreDocVersion(id, versionId, userId, actor);
}

// ===== 回收站统计 =====
export interface TrashStats {
  trashCount: number;           // 回收站文档数
  storageUsedBytes: number;     // 回收站占用存储（字节）
  storageTotalBytes: number;    // 用户总存储配额（字节）
  oldestDeletedAt: string | null; // 最旧删除时间
  oldestDeletedDocUid: string | null;
  oldestDeletedTitle: string | null;
}

export async function getTrashStats(actor: Actor): Promise<TrashStats> {
  // 获取用户自己的回收站文档（仅 user 角色）
  let trashDocs: { id: number; docUid: string; title: string; deletedAt: Date | null; }[] = [];

  if (actor.role === "user" && actor.id) {
    trashDocs = await dbAll(
      db.select({
        id: docs.id,
        docUid: docs.docUid,
        title: docs.title,
        deletedAt: docs.deletedAt
      })
        .from(docs)
        .where(and(
          eq(docs.ownerId, actor.id),
          isNotNull(docs.deletedAt)
        ))
    );
  } else if (actor.role === "admin") {
    // 管理员看到所有回收站文档
    trashDocs = await dbAll(
      db.select({
        id: docs.id,
        docUid: docs.docUid,
        title: docs.title,
        deletedAt: docs.deletedAt
      })
        .from(docs)
        .where(isNotNull(docs.deletedAt))
    );
  }

  // 获取关联的上传文件大小（近似估算）
  const trashDocIds = trashDocs.map(d => d.id);
  let storageUsedBytes = 0;

  if (trashDocIds.length > 0) {
    const uploadStats = await dbGet<{ totalSize: number | null }>(
      db.select({ totalSize: sql<number>`COALESCE(SUM(${uploads.fileSize || 0}), 0)` })
        .from(uploads)
        .where(inArray(uploads.docId, trashDocIds))
    );
    storageUsedBytes = Number(uploadStats?.totalSize || 0);
  }

  // 估算文档内容大小（基于 docVersions 表的 content_json 大小）
  const contentSize = trashDocs.length * 15 * 1024; // 假设每个文档平均 15KB
  storageUsedBytes += contentSize;

  // 查找最旧删除的文档
  let oldestInfo = { deletedAt: null as string | null, docUid: null as string | null, title: null as string | null };
  if (trashDocs.length > 0) {
    // 按 deletedAt 升序，取最旧的
    const sorted = [...trashDocs].sort((a, b) => {
      if (!a.deletedAt || !b.deletedAt) return 1;
      return a.deletedAt.getTime() - b.deletedAt.getTime();
    });
    const oldest = sorted.find(d => d.deletedAt);
    if (oldest) {
      oldestInfo = {
        deletedAt: oldest.deletedAt?.toISOString() || null,
        docUid: oldest.docUid,
        title: oldest.title
      };
    }
  }

  return {
    trashCount: trashDocs.length,
    storageUsedBytes,
    storageTotalBytes: 30 * 1024 * 1024 * 1024, // 30GB 配额
    oldestDeletedAt: oldestInfo.deletedAt,
    oldestDeletedDocUid: oldestInfo.docUid,
    oldestDeletedTitle: oldestInfo.title
  };
}
