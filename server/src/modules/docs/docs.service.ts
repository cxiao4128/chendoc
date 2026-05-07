import { and, desc, eq, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { docs, docVersions, shares, uploads } from "../../db/schema.js";
import { now } from "../../utils/date.js";
import { documentReviewHash } from "../../utils/documentReviewHash.js";
import { sanitizeDocumentHtml } from "../../utils/sanitize.js";

type Actor = { id: number; role: "admin" | "user" };
const VERSION_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
const MAX_DOC_VERSIONS = 50;

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

function normalizeLegacyDraftStatuses() {
  if (didNormalizeLegacyDraftStatuses) return;
  db.update(docs).set({ status: "published" }).where(eq(docs.status, "draft")).run();
  didNormalizeLegacyDraftStatuses = true;
}

function normalizeDocStatus(status: "draft" | "published" | "archived") {
  return status === "archived" ? "archived" : "published";
}

function normalizeDocRecord<T extends { status: "draft" | "published" | "archived" }>(doc: T): T {
  return { ...doc, status: normalizeDocStatus(doc.status) };
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

function shouldCreateVersion(docId: number, current: { title: string; contentJson: string; contentHtml: string }, next: { title?: string; contentJson?: string; contentHtml?: string }) {
  const titleChanged = next.title !== undefined && next.title !== current.title;
  const jsonChanged = next.contentJson !== undefined && next.contentJson !== current.contentJson;
  const htmlChanged = next.contentHtml !== undefined && next.contentHtml !== current.contentHtml;
  if (!titleChanged && !jsonChanged && !htmlChanged) return false;

  const latest = db
    .select({ createdAt: docVersions.createdAt })
    .from(docVersions)
    .where(eq(docVersions.docId, docId))
    .orderBy(desc(docVersions.createdAt), desc(docVersions.id))
    .limit(1)
    .get();
  if (!latest) return true;
  return Date.now() - latest.createdAt.getTime() >= VERSION_SNAPSHOT_INTERVAL_MS;
}

function pruneDocVersions(docId: number) {
  db.delete(docVersions)
    .where(sql`${docVersions.id} in (
      select id from doc_versions
      where doc_id = ${docId}
      order by created_at desc, id desc
      limit -1 offset ${MAX_DOC_VERSIONS}
    )`)
    .run();
}

function createVersionSnapshot(docId: number, current: { title: string; contentJson: string; contentHtml: string }, userId: number) {
  db.insert(docVersions).values({
    docId,
    title: current.title,
    contentJson: current.contentJson,
    contentHtml: current.contentHtml,
    createdBy: userId,
    createdAt: now()
  }).run();
  pruneDocVersions(docId);
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
  if (!canAccessDoc(actor, doc)) throw new Error("文档不存在");
}

export function listDocs(actor: Actor, query?: unknown) {
  normalizeLegacyDraftStatuses();
  const q = normalizeSearch(query);
  const pattern = `%${q}%`;
  const accessWhere = actor.role === "admin" ? isNull(docs.deletedAt) : and(isNull(docs.deletedAt), eq(docs.createdBy, actor.id));
  const where = q
    ? and(
      accessWhere,
      or(
        like(docs.title, pattern),
        like(docs.summary, pattern),
        like(docs.contentHtml, pattern),
        like(sql<string>`CAST(${shares.shareCode} AS TEXT)`, pattern),
        like(shares.customSlug, pattern)
      )
    )
    : accessWhere;

  return db
    .select(listSelect())
    .from(docs)
    .leftJoin(shares, eq(docs.id, shares.docId))
    .where(where)
    .orderBy(desc(docs.pinned), desc(docs.updatedAt))
    .all()
    .map((doc) => normalizeDocRecord(doc));
}

export function listTrashDocs() {
  normalizeLegacyDraftStatuses();
  return db
    .select(listSelect())
    .from(docs)
    .leftJoin(shares, eq(docs.id, shares.docId))
    .where(isNotNull(docs.deletedAt))
    .orderBy(desc(docs.deletedAt))
    .all()
    .map((doc) => normalizeDocRecord(doc));
}

export function createDoc(userId: number, input: unknown) {
  const body = docCreateSchema.parse(input);
  const createdAt = now();
  const result = db.insert(docs).values({
    title: body.title,
    parentId: body.parentId ?? null,
    spaceId: body.spaceId ?? null,
    contentJson: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
    contentHtml: "<p></p>",
    tags: "[]",
    status: "published",
    sort: 0,
    createdBy: userId,
    updatedBy: userId,
    createdAt,
    updatedAt: createdAt
  }).run();
  return getDoc(Number(result.lastInsertRowid));
}

export function getDoc(id: number, actor?: Actor) {
  normalizeLegacyDraftStatuses();
  const doc = db.select().from(docs).where(and(eq(docs.id, id), isNull(docs.deletedAt))).limit(1).get();
  if (!doc) throw new Error("文档不存在");
  assertCanAccessDoc(actor, doc);
  const share = db.select().from(shares).where(eq(shares.docId, doc.id)).limit(1).get();
  return { ...normalizeDocRecord(doc), share: safeShareRecord(share) };
}

export function updateDoc(id: number, userId: number, input: unknown, actor?: Actor) {
  const body = docUpdateSchema.parse(input);
  const current = getDoc(id, actor);
  const contentJson = body.contentJson === undefined
    ? undefined
    : typeof body.contentJson === "string"
      ? body.contentJson
      : JSON.stringify(body.contentJson);
  const contentHtml = body.contentHtml === undefined ? undefined : sanitizeDocumentHtml(body.contentHtml);
  const titleChanged = body.title !== undefined && body.title !== current.title;
  const jsonChanged = contentJson !== undefined && contentJson !== current.contentJson;
  const htmlChanged = contentHtml !== undefined && contentHtml !== current.contentHtml;
  const reviewRelevantChanged = titleChanged || jsonChanged || htmlChanged;

  if (shouldCreateVersion(id, current, { title: body.title, contentJson, contentHtml })) {
    createVersionSnapshot(id, current, userId);
  }

  const patch: Partial<typeof docs.$inferInsert> = {
    updatedBy: userId,
    updatedAt: now()
  };
  if (body.title !== undefined) patch.title = body.title;
  if (contentJson !== undefined) patch.contentJson = contentJson;
  if (contentHtml !== undefined) patch.contentHtml = contentHtml;
  if (body.coverUrl !== undefined) patch.coverUrl = body.coverUrl;
  if (body.summary !== undefined) patch.summary = body.summary;
  if (body.tags !== undefined) patch.tags = JSON.stringify(body.tags);
  if (body.pinned !== undefined) patch.pinned = body.pinned;
  if (body.status !== undefined) patch.status = normalizeDocStatus(body.status);
  if (body.sort !== undefined) patch.sort = body.sort;

  db.update(docs).set(patch).where(eq(docs.id, id)).run();
  if (actor?.role === "user" && reviewRelevantChanged) {
    db.update(shares).set({
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
    }).where(eq(shares.docId, id)).run();
  }
  return getDoc(id, actor);
}

export function softDeleteDoc(id: number, userId: number, actor?: Actor) {
  getDoc(id, actor);
  db.update(docs).set({ deletedAt: now(), updatedBy: userId, updatedAt: now() }).where(eq(docs.id, id)).run();
}

export function restoreDoc(id: number, userId: number) {
  db.update(docs).set({ deletedAt: null, updatedBy: userId, updatedAt: now() }).where(eq(docs.id, id)).run();
  return getDoc(id);
}

export function hardDeleteDoc(id: number) {
  const existing = db.select({ id: docs.id }).from(docs).where(eq(docs.id, id)).limit(1).get();
  if (!existing) throw new Error("文档不存在");
  db.transaction((tx) => {
    tx.delete(shares).where(eq(shares.docId, id)).run();
    tx.delete(docVersions).where(eq(docVersions.docId, id)).run();
    tx.update(uploads).set({ docId: null }).where(eq(uploads.docId, id)).run();
    tx.delete(docs).where(eq(docs.id, id)).run();
  });
}

export function publishDoc(id: number, userId: number) {
  db.update(docs).set({ status: "published", updatedBy: userId, updatedAt: now() }).where(eq(docs.id, id)).run();
  return getDoc(id);
}

export function listDocVersions(docId: number, actor?: Actor) {
  getDoc(docId, actor);
  return db
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
    .limit(50)
    .all();
}

export function restoreDocVersion(docId: number, versionId: number, userId: number, actor?: Actor) {
  const current = getDoc(docId, actor);
  const version = db
    .select()
    .from(docVersions)
    .where(and(eq(docVersions.id, versionId), eq(docVersions.docId, docId)))
    .limit(1)
    .get();
  if (!version) throw new Error("版本不存在");
  createVersionSnapshot(docId, current, userId);
  db.update(docs).set({
    title: version.title,
    contentJson: version.contentJson,
    contentHtml: version.contentHtml,
    updatedBy: userId,
    updatedAt: now()
  }).where(eq(docs.id, docId)).run();
  if (actor?.role === "user") {
    db.update(shares).set({
      isEnabled: false,
      reviewStatus: "pending",
      reviewNote: null,
      reviewContentHash: documentReviewHash(version),
      requestedBy: userId,
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: now()
    }).where(eq(shares.docId, docId)).run();
  }
  return getDoc(docId, actor);
}
