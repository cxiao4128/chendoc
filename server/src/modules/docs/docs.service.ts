/**
 * docs.service.ts
 *
 * 文档模块业务逻辑层。
 * 只含业务逻辑、权限检查、Schema 校验，不直接写 SQL。
 */

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { now } from "../../utils/date.js";
import { env } from "../../config/env.js";
import { decryptDocumentRecord, encryptDocumentContent } from "../../utils/documentCrypto.js";
import { documentReviewHash } from "../../utils/documentReviewHash.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";
import { renderContentJsonToHtml, sanitizeDocumentHtml } from "../../utils/sanitize.js";
import { canAccessDocument, type DocumentAction, type DocumentActor } from "./documentAccess.js";
import { docs, shares } from "./docs.repo.js";
import { invalidateDecryptedDocCache } from "../shares/public-api.js";
import { invalidateShareHtmlCache } from "../public/share-html-cache.js";
import { dbTransaction } from "./docs.repo.js";
import * as docRepo from "./docs.repo.js";

type Actor = DocumentActor;
type PageOptions = { page?: number; pageSize?: number };
type DocAccessTarget = { ownerId: number | null; isSuperAdminDoc: boolean | number };
type DocOwnerRole = "user" | "doc_admin" | "super_admin";
type DocScope = "user" | "admin" | "system";

// Safe subset of share fields returned to clients (excludes passwordHash, etc.)
interface SafeShare {
  id: number;
  shareCode: number;
  customSlug: string | null;
  isEnabled: boolean;
  reviewStatus: "approved" | "pending" | "rejected";
  reviewNote: string | null;
  reviewContentHash: string | null;
  requestedBy: number | null;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  hasPassword: boolean;
  viewCount: number;
  expireAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Document record shape returned by getDoc / getDocByUid
// Defined concretely rather than using $inferSelect (which is unreliable due to schema.ts type assertions)
export interface DocWithShare {
  id: number;
  docUid: string;
  spaceId: number | null;
  parentId: number | null;
  title: string;
  summary: string | null;
  tags: string;
  status: "draft" | "published" | "archived";
  pinned: boolean;
  sort: number;
  ownerId: number;
  ownerRole: "user" | "doc_admin" | "super_admin";
  scope: "user" | "admin" | "system";
  isSuperAdminDoc: boolean;
  visibility: "private" | "shared" | "public";
  tenantKey: string;
  createdBy: number | null;
  updatedBy: number | null;
  deletedAt: Date | null;
  deletedBy: number | null;
  revision: number;
  scheduledAt: Date | null;
  expiresAt: Date | null;
  autoArchive: boolean;
  createdAt: Date;
  updatedAt: Date;
  contentJson: string;
  contentHtml: string;
  share: SafeShare | null;
}
const VERSION_SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
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
  return actor?.isSuperAdmin ? { ...actor, isSuperAdmin: true } : actor;
}

async function actorFromUserId(userId: number): Promise<Actor> {
  const user = await docRepo.findUserById(userId);
  if (!user) return { id: userId, role: "user" };
  return { id: user.id, role: user.role, isSuperAdmin: isSuperAdminUser(user) };
}

function ownerRoleForActor(actor: Actor): DocOwnerRole {
  if (actor.role === "user") return "user";
  return actor.isSuperAdmin ? "super_admin" : "doc_admin";
}

function scopeForOwnerRole(ownerRole: DocOwnerRole): DocScope {
  return ownerRole === "user" ? "user" : "admin";
}

async function assertCreateLocationAccess(actor: Actor, parentId?: number | null, spaceId?: number | null) {
  if (parentId) {
    const parent = await docRepo.findDocById(parentId);
    if (!parent) throw new NotFoundError("父文档不存在", "PARENT_DOC_NOT_FOUND");
    assertCanAccessDoc(actor, parent, "update");
  }
  if (spaceId) {
    const space = await docRepo.findSpaceById(spaceId);
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

function queryAccessWhere(actor: Actor, deletedCondition: unknown): unknown {
  const normalized = normalizeActor(actor)!;
  if (normalized?.isSuperAdmin) return deletedCondition;
  const base = and(deletedCondition as ReturnType<typeof eq>, eq(docs.isSuperAdminDoc, false));
  return and(base, eq(docs.ownerId, normalized.id));
}

export function safeDocPayload<T extends Record<string, unknown>>(doc: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = doc;
  return rest as Omit<T, 'id'>;
}

export function safeDocPayloadForDocWithShare(doc: DocWithShare) {
  const { id: _id, share: _share, ...rest } = doc;
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
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function pagedResult<T>(rows: T[], options: ReturnType<typeof normalizePageOptions>) {
  const hasMore = rows.length > options.pageSize;
  return {
    docs: rows.slice(0, options.pageSize),
    pagination: { page: options.page, pageSize: options.pageSize, hasMore }
  };
}

// ============= Public API =============

export async function listDocs(actor: Actor, query?: unknown) {
  const options = normalizePageOptions();
  const q = normalizeSearch(query);
  const accessWhere = queryAccessWhere(actor, isNull(docs.deletedAt));
  const rows = await docRepo.queryDocsList({ accessWhere: accessWhere as ReturnType<typeof isNull>, query: q, pageSize: options.pageSize, offset: options.offset });
  return rows.slice(0, options.pageSize);
}

export async function listDocsPage(actor: Actor, query?: unknown, pageOptions?: PageOptions) {
  const options = normalizePageOptions(pageOptions);
  const q = normalizeSearch(query);
  const accessWhere = queryAccessWhere(actor, isNull(docs.deletedAt));
  const rows = await docRepo.queryDocsList({ accessWhere: accessWhere as ReturnType<typeof isNull>, query: q, pageSize: options.pageSize, offset: options.offset });
  return pagedResult(rows, options);
}

export async function listTrashDocs(actor?: Actor) {
  const options = normalizePageOptions();
  const accessWhere = actor ? queryAccessWhere(actor, isNotNull(docs.deletedAt)) : isNotNull(docs.deletedAt);
  const rows = await docRepo.queryTrashList({ accessWhere: accessWhere as ReturnType<typeof isNotNull>, pageSize: options.pageSize, offset: options.offset });
  return rows.slice(0, options.pageSize);
}

export async function listTrashDocsPage(actor?: Actor, pageOptions?: PageOptions) {
  const options = normalizePageOptions(pageOptions);
  const accessWhere = actor ? queryAccessWhere(actor, isNotNull(docs.deletedAt)) : isNotNull(docs.deletedAt);
  const rows = await docRepo.queryTrashList({ accessWhere: accessWhere as ReturnType<typeof isNotNull>, pageSize: options.pageSize, offset: options.offset });
  return pagedResult(rows, options);
}

export async function createDoc(userId: number, input: unknown, actor?: Actor) {
  const body = docCreateSchema.parse(input);
  const creator = normalizeActor(actor) ?? await actorFromUserId(userId);
  await assertCreateLocationAccess(creator, body.parentId, body.spaceId);
  const ownerRole = ownerRoleForActor(creator);
  const docUid = await docRepo.findUniqueDocUid();
  const createdAt = now();
  const encrypted = encryptDocumentContent(JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), "<p></p>");
  const result = await docRepo.insertDoc({
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
  });
  return await getDoc(Number(result.lastInsertRowid));
}

function buildSafeShare(share: typeof shares.$inferSelect | undefined | null): SafeShare | null {
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

function buildDocWithShare(
  decrypted: Omit<typeof docs.$inferSelect, "contentJson" | "contentHtml"> & { contentJson: string; contentHtml: string },
  share: typeof shares.$inferSelect | undefined | null
): DocWithShare {
  return {
    id: decrypted.id as number,
    docUid: decrypted.docUid as string,
    spaceId: decrypted.spaceId as number | null,
    parentId: decrypted.parentId as number | null,
    title: decrypted.title as string,
    summary: decrypted.summary as string | null,
    tags: decrypted.tags as string,
    status: decrypted.status as "draft" | "published" | "archived",
    pinned: decrypted.pinned as boolean,
    sort: decrypted.sort as number,
    ownerId: decrypted.ownerId as number,
    ownerRole: decrypted.ownerRole as "user" | "doc_admin" | "super_admin",
    scope: decrypted.scope as "user" | "admin" | "system",
    isSuperAdminDoc: decrypted.isSuperAdminDoc as boolean,
    visibility: decrypted.visibility as "private" | "shared" | "public",
    tenantKey: decrypted.tenantKey as string,
    createdBy: decrypted.createdBy as number | null,
    updatedBy: decrypted.updatedBy as number | null,
    deletedAt: decrypted.deletedAt as Date | null,
    deletedBy: decrypted.deletedBy as number | null,
    revision: decrypted.revision as number,
    scheduledAt: decrypted.scheduledAt as Date | null,
    expiresAt: decrypted.expiresAt as Date | null,
    autoArchive: decrypted.autoArchive as boolean,
    createdAt: decrypted.createdAt as Date,
    updatedAt: decrypted.updatedAt as Date,
    contentJson: decrypted.contentJson,
    contentHtml: decrypted.contentHtml,
    share: buildSafeShare(share)
  };
}

export async function getDoc(id: number, actor?: Actor): Promise<DocWithShare> {
  const doc = await docRepo.findDocById(id);
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  const decrypted = decryptDocumentRecord(doc as Parameters<typeof decryptDocumentRecord>[0]);
  if (actor) assertCanAccessDoc(actor, decrypted as unknown as DocAccessTarget, "read");
  const share = await docRepo.findShareByDocId(decrypted.id as number);
  return buildDocWithShare(decrypted as unknown as Omit<typeof docs.$inferSelect, "contentJson" | "contentHtml"> & { contentJson: string; contentHtml: string }, share);
}

export async function getDocByUid(docUid: string, actor: Actor): Promise<DocWithShare> {
  const uid = docUidParam(docUid);
  const doc = await docRepo.findDocByUid(uid);
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  const decrypted = decryptDocumentRecord(doc as Parameters<typeof decryptDocumentRecord>[0]);
  assertCanAccessDoc(actor, decrypted as unknown as DocAccessTarget, "read");
  const share = await docRepo.findShareByDocId(decrypted.id as number);
  return buildDocWithShare(decrypted as unknown as Omit<typeof docs.$inferSelect, "contentJson" | "contentHtml"> & { contentJson: string; contentHtml: string }, share);
}

async function docIdByUid(docUid: string, actor: Actor, action: DocumentAction, includeDeleted = false) {
  const uid = docUidParam(docUid);
  const doc = includeDeleted
    ? await docRepo.findDocByUidAnyStatus(uid)
    : await docRepo.findDocByUid(uid);
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  assertCanAccessDoc(actor, doc as DocAccessTarget, action);
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

  const patch: Record<string, unknown> = {
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
  if (body.status !== undefined) patch.status = body.status;
  if (body.sort !== undefined) patch.sort = body.sort;
  if (actor?.role === "user" && reviewRelevantChanged) patch.visibility = "private";

  const expectedRevision = body.expectedRevision ?? (current.revision ?? 1);
  await dbTransaction(async (tx) => {
    if (await docRepo.shouldCreateVersion(tx, id, current as unknown as { title: string; contentJson: string; contentHtml: string }, { title: body.title, contentJson, contentHtml }, VERSION_SNAPSHOT_INTERVAL_MS)) {
      await docRepo.createVersionSnapshotAndPrune(tx, id, current as unknown as { title: string; contentJson: string; contentHtml: string }, userId);
    }
    const result = await docRepo.updateDocAndShareTx(tx, id, patch as Parameters<typeof docRepo.updateDocById>[1], actor?.role === "user" && reviewRelevantChanged ? {
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
    } : undefined, body.expectedRevision !== undefined ? expectedRevision : undefined);
    if (result.changes !== 1) {
      throw new ConflictError("文档已在其他窗口更新，请刷新后合并内容", "DOC_REVISION_CONFLICT");
    }
  });

  Promise.resolve().then(() => {
    invalidateShareHtmlCache(current.share?.shareCode);
    invalidateShareHtmlCache(current.share?.customSlug ?? undefined);
  }).catch(() => undefined);
  Promise.resolve().then(() => invalidateDecryptedDocCache(id)).catch(() => undefined);

  return await getDoc(id, actor);
}

export async function softDeleteDoc(id: number, userId: number, actor?: Actor) {
  const current = await getDoc(id, actor);
  await docRepo.softDeleteDocById(id, userId);
  return { docUid: current.docUid, ownerId: current.ownerId };
}

export async function bulkSoftDeleteDocs(ids: number[], userId: number, actor: Actor) {
  const uniqueIds = uniquePositiveIds(ids);
  const deletedIds: number[] = [];
  for (const id of uniqueIds) {
    const doc = await docRepo.findDocById(id);
    if (!doc) continue;
    assertCanAccessDoc(actor, doc as DocAccessTarget, "batch");
    const result = await docRepo.softDeleteDocById(id, userId);
    if (result.changes > 0) deletedIds.push(id);
  }
  return deletedIds;
}

export async function restoreDoc(id: number, userId: number, actor?: Actor) {
  const existing = await docRepo.findDocByIdInTrash(id);
  if (!existing) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  if (actor) assertCanAccessDoc(actor, existing as DocAccessTarget, "restore");
  await docRepo.restoreDocById(id, userId);
  return await getDoc(id, actor);
}

export async function bulkRestoreDocs(ids: number[], userId: number, actor?: Actor) {
  const uniqueIds = uniquePositiveIds(ids);
  if (!uniqueIds.length) return [];
  const rows = await docRepo.findDocsByIds(uniqueIds);
  const filtered = rows.filter((row) => {
    if (!row.deletedAt) return false;
    return canAccessDocument(normalizeActor(actor), row as { ownerId: number | null; isSuperAdminDoc: boolean | number }, "batch");
  });
  const restoredIds = filtered.map((row) => row.id);
  if (!restoredIds.length) return [];
  await docRepo.restoreDocsByIds(restoredIds, userId);
  return restoredIds;
}

export async function hardDeleteDoc(id: number, actor?: Actor) {
  const existing = await docRepo.findDocByIdInTrash(id);
  if (!existing) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  if (actor) assertCanAccessDoc(actor, existing as DocAccessTarget, "permanent_delete");
  await docRepo.deleteDocById(id);
}

export async function bulkHardDeleteTrashDocs(ids: number[], actor?: Actor) {
  const uniqueIds = uniquePositiveIds(ids);
  if (!uniqueIds.length) return [];
  const rows = await docRepo.findDocsByIds(uniqueIds);
  const filtered = rows.filter((row) => {
    if (!row.deletedAt) return false;
    return canAccessDocument(normalizeActor(actor), row as { ownerId: number | null; isSuperAdminDoc: boolean | number }, "batch");
  });
  const deletedIds = filtered.map((row) => row.id);
  if (!deletedIds.length) return [];
  await docRepo.deleteDocsByIds(deletedIds);
  return deletedIds;
}

async function accessibleDocsByUids(docUids: string[], actor: Actor, action: DocumentAction, deleted: "active" | "trash") {
  const uids = uniqueDocUids(docUids);
  if (!uids.length) return [];
  const rows = deleted === "trash"
    ? await docRepo.findDocsByUidsInTrash(uids)
    : await docRepo.findDocsByUidsNotDeleted(uids);
  return rows.filter((row) => canAccessDocument(normalizeActor(actor), row as { ownerId: number | null; isSuperAdminDoc: boolean | number }, action));
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
  await docRepo.softDeleteDocsByIds(ids, userId, deletedAt);
  return rows.map((row) => row.docUid);
}

export async function restoreDocByUid(docUid: string, userId: number, actor: Actor) {
  const id = await docIdByUid(docUid, actor, "restore", true);
  return await restoreDoc(id, userId, actor);
}

export async function bulkRestoreDocsByUid(docUids: string[], userId: number, actor: Actor) {
  const rows = await accessibleDocsByUids(docUids, actor, "batch", "trash");
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  await docRepo.restoreDocsByIds(ids, userId);
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
  await docRepo.deleteDocsByIds(ids);
  return rows.map((row) => row.docUid);
}

export async function publishDocByUid(docUid: string, userId: number, actor: Actor) {
  const id = await docIdByUid(docUid, actor, "update");
  return await publishDoc(id, userId, actor);
}

export async function publishDoc(id: number, userId: number, actor?: Actor) {
  if (actor) await getDoc(id, actor);
  await docRepo.updateDocById(id, { status: "published", updatedBy: userId, updatedAt: now() });
  return await getDoc(id, actor);
}

export async function listDocVersions(docId: number, actor?: Actor) {
  const current = await getDoc(docId, actor);
  const rows = await docRepo.findVersionsByDocId(docId);
  const userIds = Array.from(new Set(rows.map((row) => row.createdBy).filter((id): id is number => !!id)));
  const authors = userIds.length ? await docRepo.findUsersByIds(userIds) : [];
  const authorMap = new Map(authors.map((author) => [author.id, author.username]));
  const currentWordCount = plainTextFromHtml(current.contentHtml).length;
  return rows.map((row) => {
    const version = decryptDocumentRecord(row as Parameters<typeof decryptDocumentRecord>[0]);
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
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
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
  const row = await docRepo.findVersionById(versionId, docId);
  if (!row) throw new NotFoundError("版本不存在", "VERSION_NOT_FOUND");
  const version = decryptDocumentRecord(row as Parameters<typeof decryptDocumentRecord>[0]);
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
  const docId = await docIdByUid(docUid, actor, "history");
  const row = await docRepo.findVersionById(versionId, docId);
  if (!row) throw new NotFoundError("版本不存在", "VERSION_NOT_FOUND");
  const version = decryptDocumentRecord(row as Parameters<typeof decryptDocumentRecord>[0]);
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
  const version = await docRepo.findVersionById(versionId, docId);
  if (!version) throw new NotFoundError("版本不存在", "VERSION_NOT_FOUND");
  const decryptedVersion = decryptDocumentRecord(version as Parameters<typeof decryptDocumentRecord>[0]) as unknown as { title: string; contentJson: string; contentHtml: string };
  const encrypted = encryptDocumentContent(decryptedVersion.contentJson, decryptedVersion.contentHtml);
  const docPatch = {
    title: decryptedVersion.title,
    ...encrypted,
    updatedBy: userId,
    updatedAt: now(),
    revision: (current.revision + 1) as number
  };
  await dbTransaction(async (tx) => {
    await docRepo.createVersionSnapshotAndPrune(tx, docId, current as unknown as { title: string; contentJson: string; contentHtml: string }, userId);
    const result = await docRepo.updateDocAndShareTx(tx, docId, docPatch, actor?.role === "user" ? {
      isEnabled: false,
      reviewStatus: "pending",
      reviewNote: null,
      reviewContentHash: documentReviewHash(decryptedVersion),
      requestedBy: userId,
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: now()
    } : undefined, current.revision);
    if (result.changes !== 1) throw new ConflictError("文档已在其他窗口更新，请刷新后重试", "DOC_REVISION_CONFLICT");
  });
  invalidateShareHtmlCache(current.share?.shareCode);
  invalidateShareHtmlCache(current.share?.customSlug ?? undefined);
  invalidateDecryptedDocCache(docId);
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
    docRepo.queryTrashAggregate(accessWhere as ReturnType<typeof isNotNull>),
    docRepo.queryTrashUploadSize(accessWhere as ReturnType<typeof isNotNull>),
    docRepo.findOldestTrashDoc(accessWhere as ReturnType<typeof isNotNull>)
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
  const rows = await docRepo.findExpiredTrashDocs(cutoff);
  if (!rows.length) return 0;
  return (await bulkHardDeleteTrashDocs(rows.map((row) => row.id), { id: 0, role: "admin", isSuperAdmin: true })).length;
}

// ===== 定时发布和草稿过期 =====

export interface ScheduleInfo {
  scheduledAt: Date | null;
  expiresAt: Date | null;
  autoArchive: boolean;
}

export async function setDocumentSchedule(actor: Actor, docUid: string, input: {
  scheduledAt?: string | null;
  expiresAt?: string | null;
  autoArchive?: boolean;
}): Promise<ScheduleInfo> {
  const docId = await docRepo.findDocIdByUid(docUid);
  if (!docId) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  const doc = await docRepo.findDocById(docId);
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  assertCanAccessDoc(actor, doc as { ownerId: number | null; isSuperAdminDoc: boolean | number }, "update");
  await docRepo.updateDocSchedule(docId, {
    scheduledAt: input.scheduledAt !== undefined ? (input.scheduledAt ? new Date(input.scheduledAt) : null) : undefined,
    expiresAt: input.expiresAt !== undefined ? (input.expiresAt ? new Date(input.expiresAt) : null) : undefined,
    autoArchive: input.autoArchive
  });
  const updated = await docRepo.findDocSchedule(docUid);
  return {
    scheduledAt: updated?.scheduledAt ?? null,
    expiresAt: updated?.expiresAt ?? null,
    autoArchive: updated?.autoArchive ?? false
  };
}

export async function getDocumentSchedule(docUid: string, actor: Actor): Promise<ScheduleInfo | null> {
  const docId = await docIdByUid(docUid, actor, "read");
  const schedule = await docRepo.findDocSchedule(docUid);
  if (!docId || !schedule) return null;
  return { scheduledAt: schedule.scheduledAt, expiresAt: schedule.expiresAt, autoArchive: schedule.autoArchive };
}

export async function processScheduledDocs() {
  const now = new Date();
  const rows = await docRepo.findScheduledDocsToPublish(now);
  if (!rows.length) return { published: 0 };
  let published = 0;
  for (const row of rows) {
    try {
      await docRepo.publishScheduledDoc(row.id);
      published++;
    } catch (error) {
      console.error(`Failed to publish scheduled doc ${row.docUid}:`, error);
    }
  }
  return { published };
}

export async function processExpiredDrafts() {
  const now = new Date();
  const rows = await docRepo.findExpiredDrafts(now);
  if (!rows.length) return { expired: 0, archived: 0 };
  let expired = 0;
  let archived = 0;
  for (const row of rows) {
    try {
      if (row.autoArchive) {
        await docRepo.archiveExpiredDoc(row.id);
        archived++;
      } else {
        await docRepo.clearExpiredDoc(row.id);
      }
      expired++;
    } catch (error) {
      console.error(`Failed to process expired draft ${row.docUid}:`, error);
    }
  }
  return { expired, archived };
}
