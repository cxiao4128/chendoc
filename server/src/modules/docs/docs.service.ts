import { and, desc, eq, inArray, isNotNull, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import { castAsText, db, dbAll, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { docs, docVersions, shares, uploads, users } from "../../db/schema.js";
import { now } from "../../utils/date.js";
import { decryptDocumentRecord, encryptDocumentContent } from "../../utils/documentCrypto.js";
import { documentReviewHash } from "../../utils/documentReviewHash.js";
import { NotFoundError } from "../../utils/errors.js";
import { renderContentJsonToHtml, sanitizeDocumentHtml } from "../../utils/sanitize.js";

type Actor = { id: number; role: "admin" | "user" };
type PageOptions = { page?: number; pageSize?: number };
const VERSION_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
const MAX_DOC_VERSIONS = 50;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

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

function uniquePositiveIds(ids: number[]) {
  return Array.from(new Set(ids)).filter((id) => Number.isInteger(id) && id > 0);
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
    docId: share.docId,
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
    spaceId: docs.spaceId,
    parentId: docs.parentId,
    title: docs.title,
    summary: docs.summary,
    status: docs.status,
    pinned: docs.pinned,
    sort: docs.sort,
    createdBy: docs.createdBy,
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

function canAccessDoc(actor: Actor | undefined, doc: { createdBy: number | null }) {
  if (!actor) return true;
  if (actor.role === "admin") return true;
  return doc.createdBy === actor.id;
}

function assertCanAccessDoc(actor: Actor | undefined, doc: { createdBy: number | null }) {
  if (!canAccessDoc(actor, doc)) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
}

export async function listDocs(actor: Actor, query?: unknown) {
  const options = normalizePageOptions();
  return (await queryDocs(actor, query, options)).slice(0, options.pageSize);
}

async function queryDocs(actor: Actor, query?: unknown, options: ReturnType<typeof normalizePageOptions> = normalizePageOptions()) {
  await normalizeLegacyDraftStatuses();
  const q = normalizeSearch(query);
  const pattern = `%${q}%`;
  const accessWhere = actor.role === "admin" ? isNull(docs.deletedAt) : and(isNull(docs.deletedAt), eq(docs.createdBy, actor.id));
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
  const accessWhere = actor?.role === "user"
    ? and(isNotNull(docs.deletedAt), eq(docs.createdBy, actor.id))
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

export async function createDoc(userId: number, input: unknown) {
  const body = docCreateSchema.parse(input);
  const createdAt = now();
  const encrypted = encryptDocumentContent(JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), "<p></p>");
  const result = await dbRun(db.insert(docs).values({
    title: body.title,
    parentId: body.parentId ?? null,
    spaceId: body.spaceId ?? null,
    ...encrypted,
    tags: "[]",
    status: "published",
    sort: 0,
    createdBy: userId,
    updatedBy: userId,
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
  assertCanAccessDoc(actor, decrypted);
  const share = await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.docId, decrypted.id)).limit(1));
  return { ...normalizeDocRecord(decrypted), share: safeShareRecord(share) };
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
  return await getDoc(id, actor);
}

export async function softDeleteDoc(id: number, userId: number, actor?: Actor) {
  await getDoc(id, actor);
  await dbRun(db.update(docs).set({ deletedAt: now(), updatedBy: userId, updatedAt: now() }).where(eq(docs.id, id)));
}

export async function bulkSoftDeleteDocs(ids: number[], userId: number, actor: Actor) {
  const uniqueIds = uniquePositiveIds(ids);
  const deletedIds: number[] = [];
  const deletedAt = now();

  await dbTransaction(async (tx) => {
    for (const id of uniqueIds) {
      const doc = await dbGet<{ id: number; createdBy: number | null }>(tx
        .select({ id: docs.id, createdBy: docs.createdBy })
        .from(docs)
        .where(and(eq(docs.id, id), isNull(docs.deletedAt)))
        .limit(1));
      if (!doc) continue;
      assertCanAccessDoc(actor, doc);
      const result = await dbRun(tx.update(docs).set({ deletedAt, updatedBy: userId, updatedAt: deletedAt }).where(eq(docs.id, id)));
      if (result.changes > 0) deletedIds.push(id);
    }
  });

  return deletedIds;
}

export async function restoreDoc(id: number, userId: number, actor?: Actor) {
  const existing = await dbGet<{ id: number; createdBy: number | null }>(db
    .select({ id: docs.id, createdBy: docs.createdBy })
    .from(docs)
    .where(and(eq(docs.id, id), isNotNull(docs.deletedAt)))
    .limit(1));
  if (!existing) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  assertCanAccessDoc(actor, existing);
  await dbRun(db.update(docs).set({ deletedAt: null, updatedBy: userId, updatedAt: now() }).where(eq(docs.id, id)));
  return await getDoc(id, actor);
}

export async function bulkRestoreDocs(ids: number[], userId: number, actor?: Actor) {
  const uniqueIds = uniquePositiveIds(ids);
  if (!uniqueIds.length) return [];

  const rows = await dbAll<{ id: number; createdBy: number | null }>(db
    .select({ id: docs.id, createdBy: docs.createdBy })
    .from(docs)
    .where(and(inArray(docs.id, uniqueIds), isNotNull(docs.deletedAt))));
  const restoredIds = rows.filter((row) => canAccessDoc(actor, row)).map((row) => row.id);
  if (!restoredIds.length) return [];

  const updatedAt = now();
  await dbRun(db.update(docs).set({ deletedAt: null, updatedBy: userId, updatedAt }).where(inArray(docs.id, restoredIds)));
  return restoredIds;
}

export async function hardDeleteDoc(id: number, actor?: Actor) {
  const existing = await dbGet<{ id: number; createdBy: number | null }>(db
    .select({ id: docs.id, createdBy: docs.createdBy })
    .from(docs)
    .where(and(eq(docs.id, id), isNotNull(docs.deletedAt)))
    .limit(1));
  if (!existing) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  assertCanAccessDoc(actor, existing);
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

  const rows = await dbAll<{ id: number; createdBy: number | null }>(db
    .select({ id: docs.id, createdBy: docs.createdBy })
    .from(docs)
    .where(and(inArray(docs.id, uniqueIds), isNotNull(docs.deletedAt))));
  const deletedIds = rows.filter((row) => canAccessDoc(actor, row)).map((row) => row.id);
  if (!deletedIds.length) return [];

  await dbTransaction(async (tx) => {
    await dbRun(tx.delete(shares).where(inArray(shares.docId, deletedIds)));
    await dbRun(tx.delete(docVersions).where(inArray(docVersions.docId, deletedIds)));
    await dbRun(tx.update(uploads).set({ docId: null }).where(inArray(uploads.docId, deletedIds)));
    await dbRun(tx.delete(docs).where(inArray(docs.id, deletedIds)));
  });

  return deletedIds;
}

export async function publishDoc(id: number, userId: number) {
  await dbRun(db.update(docs).set({ status: "published", updatedBy: userId, updatedAt: now() }).where(eq(docs.id, id)));
  return await getDoc(id);
}

export async function listDocVersions(docId: number, actor?: Actor) {
  await getDoc(docId, actor);
  return await dbAll(db
    .select({
      id: docVersions.id,
      docId: docVersions.docId,
      title: docVersions.title,
      createdBy: docVersions.createdBy,
      createdAt: docVersions.createdAt
    })
    .from(docVersions)
    .where(eq(docVersions.docId, docId))
    .orderBy(desc(docVersions.createdAt), desc(docVersions.id))
    .limit(50));
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
