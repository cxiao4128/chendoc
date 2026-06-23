import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db, dbAll, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { docs, shares, users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { enqueueSecurityLog } from "../../utils/asyncLogQueue.js";
import { now } from "../../utils/date.js";
import { decryptDocumentRecord } from "../../utils/documentCrypto.js";
import { documentReviewHash } from "../../utils/documentReviewHash.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { sanitizeDocumentHtml } from "../../utils/sanitize.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { generateShareToken, isWeakShareToken } from "../../utils/shareToken.js";
import { canAccessDocument } from "../docs/documentAccess.js";

type Actor = { id: number; role: "admin" | "user"; isSuperAdmin?: boolean };

const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(48)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => !/^\d+$/.test(value), "custom slug cannot be all digits")
  .transform((value) => value.toLowerCase());

const ADMIN_SHARE_CODE_MIN = 111;
const ADMIN_SHARE_CODE_MAX = 9999;
const USER_SHARE_CODE_MIN = 1_000_000;
const USER_SHARE_CODE_MAX = 9_999_999;
const USER_SHARE_CODE_MAX_EXCLUSIVE = USER_SHARE_CODE_MAX + 1;

const shareCodeSchema = z.number().int().min(ADMIN_SHARE_CODE_MIN).max(USER_SHARE_CODE_MAX);
const sharePasswordSchema = z.union([z.literal(""), z.string().min(8).max(80)]).optional().nullable();

const createShareSchema = z.object({
  isEnabled: z.boolean().optional(),
  password: sharePasswordSchema,
  expireAt: z.string().datetime().optional().nullable(),
  customSlug: slugSchema.optional().nullable(),
  shareCode: shareCodeSchema.optional().nullable()
});

const updateShareSchema = z.object({
  isEnabled: z.boolean().optional(),
  password: sharePasswordSchema,
  expireAt: z.string().datetime().optional().nullable(),
  customSlug: slugSchema.optional().nullable(),
  shareCode: shareCodeSchema.optional().nullable()
});

const reviewShareSchema = z.object({
  action: z.enum(["approve", "reject"]),
  shareCode: shareCodeSchema.optional().nullable(),
  customSlug: slugSchema.optional().nullable(),
  note: z.string().trim().max(200).optional().nullable()
});

const shareAccessTokenSchema = z.object({
  shareId: z.number().int().positive(),
  docId: z.number().int().positive()
});

const sharePasswordAttempts = new Map<string, { count: number; firstAt: number; nextAllowedAt: number; lockedUntil: number }>();
const SHARE_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const SHARE_PASSWORD_LOCK_MS = 10 * 60 * 1000;
const SHARE_PASSWORD_BACKOFF_THRESHOLD = 4;
const SHARE_PASSWORD_LOCK_THRESHOLD = 8;
const SHARE_PASSWORD_ATTEMPT_MAX_SIZE = 5_000;

export class ShareAccessError extends AppError {
  constructor(code: string, message: string, statusCode = 400) {
    super(statusCode, code, message);
  }
}

function parseExpireAt(value?: string | null) {
  return value ? new Date(value) : null;
}

async function assertShareCodeAvailable(shareCode: number | null | undefined, currentShareId?: number) {
  if (!shareCode) return;
  const existing = await dbGet<{ id: number }>(db.select({ id: shares.id }).from(shares).where(eq(shares.shareCode, shareCode)).limit(1));
  if (existing && existing.id !== currentShareId) throw new BadRequestError("分享数字已被占用", "SHARE_CODE_TAKEN");
}

function assertNoCustomSlug(customSlug: string | null | undefined) {
  if (customSlug) throw new BadRequestError("分享链接只允许使用数字码", "CUSTOM_SLUG_DISABLED");
}

function isAdminShareCode(shareCode: number) {
  return shareCode >= ADMIN_SHARE_CODE_MIN && shareCode <= ADMIN_SHARE_CODE_MAX;
}

function isUserShareCode(shareCode: number) {
  return shareCode >= USER_SHARE_CODE_MIN && shareCode <= USER_SHARE_CODE_MAX;
}

function assertAdminShareCode(shareCode: number | null | undefined) {
  if (shareCode === undefined || shareCode === null) return;
  if (!isAdminShareCode(shareCode)) throw new BadRequestError("管理员分享数字必须在 111-9999 之间", "INVALID_SHARE_CODE");
}

function assertUserShareCode(shareCode: number | null | undefined) {
  if (shareCode === undefined || shareCode === null) return;
  if (!isUserShareCode(shareCode)) throw new BadRequestError("普通用户分享数字必须是 7 位数字", "INVALID_SHARE_CODE");
}

function assertShareCodeRangeForDoc(shareCode: number | null | undefined, userOwned: boolean) {
  if (userOwned) assertUserShareCode(shareCode);
  else assertAdminShareCode(shareCode);
}

function isValidPublicShareCode(shareCode: number) {
  return isAdminShareCode(shareCode) || isUserShareCode(shareCode);
}

async function nextAdminShareCode() {
  const rows = await dbAll<{ code: number }>(db
    .select({ code: shares.shareCode })
    .from(shares)
    .where(sql`${shares.shareCode} >= ${ADMIN_SHARE_CODE_MIN} and ${shares.shareCode} <= ${ADMIN_SHARE_CODE_MAX}`));
  const used = new Set(rows.map((row) => row.code));
  for (let code = ADMIN_SHARE_CODE_MIN; code <= ADMIN_SHARE_CODE_MAX; code += 1) {
    if (!used.has(code)) return code;
  }
  throw new BadRequestError("管理员分享编号已用完", "SHARE_CODE_EXHAUSTED");
}

async function randomUserShareCode() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = randomInt(USER_SHARE_CODE_MIN, USER_SHARE_CODE_MAX_EXCLUSIVE);
    const existing = await dbGet<{ id: number }>(db.select({ id: shares.id }).from(shares).where(eq(shares.shareCode, code)).limit(1));
    if (!existing) return code;
  }
  throw new Error("分享数字生成失败，请稍后重试");
}

async function createUniqueShareToken(currentShareId?: number) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateShareToken();
    const existing = await dbGet<{ id: number }>(db.select({ id: shares.id }).from(shares).where(eq(shares.shareToken, token)).limit(1));
    if (!existing || existing.id === currentShareId) return token;
  }
  throw new Error("share_token generation failed.");
}

async function docWithOwner(docId: number) {
  const row = await dbGet<{
    id: number;
    docUid: string;
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
  }>(db
    .select({
      id: docs.id,
      docUid: docs.docUid,
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
    .limit(1));
  if (!row) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  return decryptDocumentRecord(row);
}

async function docWithOwnerByUid(docUid: string) {
  const row = await dbGet<{ id: number }>(db.select({ id: docs.id }).from(docs).where(eq(docs.docUid, docUid)).limit(1));
  if (!row) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  return await docWithOwner(row.id);
}

async function shareWithDoc(shareId: number) {
  const share = await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.id, shareId)).limit(1));
  if (!share) throw new NotFoundError("分享不存在", "SHARE_NOT_FOUND");
  return { share, doc: await docWithOwner(share.docId) };
}

function isUserOwnedDoc(doc: { ownerRole: string | null }) {
  return doc.ownerRole === "user";
}

function assertCanManageDocShare(actor: Actor, doc: { ownerId: number | null; isSuperAdminDoc: boolean }) {
  if (canAccessDocument(actor, doc, "share")) return;
  throw new ForbiddenError("无权访问该文档", "DOC_FORBIDDEN");
}

async function syncDocVisibilityForShare(executor: any, docId: number, share: { isEnabled: boolean; reviewStatus: string }) {
  const visibility = share.isEnabled && share.reviewStatus === "approved" ? "shared" : "private";
  await dbRun(executor.update(docs).set({
    visibility,
    ...(visibility === "shared" ? { status: "published" as const } : {}),
    revision: sql`${docs.revision} + 1`,
    updatedAt: now()
  }).where(eq(docs.id, docId)));
}

export async function createOrGetShare(docId: number, input: unknown, actor: Actor = { id: 1, role: "admin" }) {
  const body = createShareSchema.parse(input ?? {});
  const doc = await docWithOwner(docId);
  assertCanManageDocShare(actor, doc);

  const existing = await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.docId, docId)).limit(1));
  if (existing) return existing;

  const userOwned = isUserOwnedDoc(doc);
  if (actor.role !== "admin" && (body.customSlug || body.shareCode)) {
    throw new ForbiddenError("普通用户不能自定义分享链接", "SHARE_CUSTOM_CODE_FORBIDDEN");
  }

  assertNoCustomSlug(body.customSlug);
  assertShareCodeRangeForDoc(body.shareCode, userOwned);
  await assertShareCodeAvailable(body.shareCode ?? undefined);

  const isAdminDoc = !userOwned;
  const isAdminApprovingUserDoc = userOwned && actor.role === "admin";
  const reviewContentHash = userOwned ? documentReviewHash(doc) : null;
  const createdAt = now();
  const shareCode = body.shareCode ?? (userOwned ? await randomUserShareCode() : await nextAdminShareCode());
  const values = {
    docId,
    shareCode,
    shareToken: await createUniqueShareToken(),
    customSlug: null,
    passwordHash: body.password ? await hashPassword(body.password) : null,
    isEnabled: isAdminDoc || isAdminApprovingUserDoc ? body.isEnabled ?? false : false,
    reviewStatus: isAdminDoc || isAdminApprovingUserDoc ? "approved" as const : "pending" as const,
    reviewNote: null,
    reviewContentHash,
    requestedBy: userOwned ? doc.createdBy ?? actor.id : null,
    reviewedBy: isAdminApprovingUserDoc ? actor.id : null,
    reviewedAt: isAdminApprovingUserDoc ? createdAt : null,
    expireAt: parseExpireAt(body.expireAt),
    viewCount: 0,
    createdAt,
    updatedAt: createdAt
  };
  try {
    return await dbTransaction(async (tx) => {
      const result = await dbRun(tx.insert(shares).values(values));
      const created = await dbGet<typeof shares.$inferSelect>(tx.select().from(shares).where(eq(shares.id, Number(result.lastInsertRowid))).limit(1));
      if (!created) throw new Error("分享创建失败");
      await syncDocVisibilityForShare(tx, docId, created);
      return created;
    });
  } catch (error) {
    const raced = await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.docId, docId)).limit(1));
    if (raced) return raced;
    throw error;
  }
}

export async function updateShare(id: number, input: unknown, actor: Actor = { id: 1, role: "admin" }) {
  const body = updateShareSchema.parse(input);
  const { share: current, doc } = await shareWithDoc(id);
  assertCanManageDocShare(actor, doc);

  const userOwned = isUserOwnedDoc(doc);
  const patch: Partial<typeof shares.$inferInsert> = { updatedAt: now() };

  if (actor.role !== "admin") {
    if (body.customSlug !== undefined || body.shareCode !== undefined) {
      throw new ForbiddenError("普通用户不能自定义分享链接", "SHARE_CUSTOM_CODE_FORBIDDEN");
    }
    if (body.isEnabled !== undefined) {
      if (body.isEnabled && current.reviewStatus === "approved") {
        patch.isEnabled = true;
      } else if (body.isEnabled) {
        if (current.reviewStatus === "rejected" && current.reviewContentHash === documentReviewHash(doc)) {
          throw new BadRequestError("未通过文档需更新内容后才可再次提交", "SHARE_REVIEW_CONTENT_UNCHANGED");
        }
        patch.isEnabled = false;
        patch.reviewStatus = "pending";
        patch.reviewNote = null;
        patch.reviewContentHash = documentReviewHash(doc);
        patch.requestedBy = actor.id;
        patch.reviewedBy = null;
        patch.reviewedAt = null;
      } else {
        patch.isEnabled = false;
      }
    }
  } else {
    if (body.isEnabled !== undefined) patch.isEnabled = body.isEnabled;
    if (body.shareCode !== undefined) {
      const nextShareCode = body.shareCode ?? current.shareCode;
      assertShareCodeRangeForDoc(nextShareCode, userOwned);
      await assertShareCodeAvailable(nextShareCode, id);
      patch.shareCode = nextShareCode;
    }
    if (body.customSlug !== undefined) {
      assertNoCustomSlug(body.customSlug);
      patch.customSlug = null;
    }
    if (userOwned && body.isEnabled) {
      patch.reviewStatus = "approved";
      patch.reviewNote = null;
      patch.reviewContentHash = documentReviewHash(doc);
      patch.reviewedBy = actor.id;
      patch.reviewedAt = now();
    }
  }

  if (isWeakShareToken(current.shareToken, current.shareCode)) patch.shareToken = await createUniqueShareToken(id);
  if (body.password !== undefined) patch.passwordHash = body.password ? await hashPassword(body.password) : null;
  if (body.expireAt !== undefined) patch.expireAt = parseExpireAt(body.expireAt);

  await dbTransaction(async (tx) => {
    await dbRun(tx.update(shares).set(patch).where(eq(shares.id, id)));
    await syncDocVisibilityForShare(tx, current.docId, { ...current, ...patch });
  });
  return { docUid: doc.docUid, ownerId: doc.ownerId };
}

export async function getShareByDoc(docId: number, actor?: Actor) {
  if (actor) {
    const doc = await docWithOwner(docId);
    assertCanManageDocShare(actor, doc);
  }
  return (await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.docId, docId)).limit(1))) ?? null;
}

export async function createOrGetShareByDocUid(docUid: string, input: unknown, actor: Actor) {
  const doc = await docWithOwnerByUid(docUid);
  assertCanManageDocShare(actor, doc);
  return await createOrGetShare(doc.id, input, actor);
}

export async function getShareByDocUid(docUid: string, actor: Actor) {
  const doc = await docWithOwnerByUid(docUid);
  assertCanManageDocShare(actor, doc);
  return (await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.docId, doc.id)).limit(1))) ?? null;
}

export function adminSharePayload(share: typeof shares.$inferSelect) {
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

export async function deleteShare(id: number, actor: Actor) {
  const { doc } = await shareWithDoc(id);
  assertCanManageDocShare(actor, doc);
  await dbTransaction(async (tx) => {
    await dbRun(tx.delete(shares).where(eq(shares.id, id)));
    await dbRun(tx.update(docs).set({ visibility: "private", revision: sql`${docs.revision} + 1`, updatedAt: now() }).where(eq(docs.id, doc.id)));
  });
  return { docUid: doc.docUid, ownerId: doc.ownerId };
}

export async function listUserShareReviews() {
  return await dbAll(db
    .select({
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
    .orderBy(sql`case ${shares.reviewStatus} when 'pending' then 0 when 'rejected' then 1 else 2 end`, sql`${shares.updatedAt} desc`));
}

export async function reviewUserShare(id: number, input: unknown, adminId: number) {
  const body = reviewShareSchema.parse(input);
  const { share: current, doc } = await shareWithDoc(id);
  if (!isUserOwnedDoc(doc)) throw new BadRequestError("管理员文档不需要审核", "SHARE_REVIEW_NOT_REQUIRED");
  if (current.reviewStatus !== "pending") throw new BadRequestError("只能审核待审核文档", "SHARE_REVIEW_STATUS_INVALID");

  const patch: Partial<typeof shares.$inferInsert> = {
    reviewStatus: body.action === "approve" ? "approved" : "rejected",
    isEnabled: body.action === "approve",
    reviewNote: body.note ?? null,
    reviewContentHash: documentReviewHash(doc),
    reviewedBy: adminId,
    reviewedAt: now(),
    updatedAt: now()
  };

  if (body.shareCode !== undefined) {
    const nextShareCode = body.shareCode ?? current.shareCode;
    assertUserShareCode(nextShareCode);
    await assertShareCodeAvailable(nextShareCode, id);
    patch.shareCode = nextShareCode;
  } else if (body.action === "approve" && !isUserShareCode(current.shareCode)) {
    patch.shareCode = await randomUserShareCode();
  }
  if (isWeakShareToken(current.shareToken, current.shareCode)) patch.shareToken = await createUniqueShareToken(id);
  if (body.customSlug !== undefined) {
    assertNoCustomSlug(body.customSlug);
    patch.customSlug = null;
  }

  await dbTransaction(async (tx) => {
    await dbRun(tx.update(shares).set(patch).where(eq(shares.id, id)));
    await syncDocVisibilityForShare(tx, current.docId, { ...current, ...patch });
  });
}

function shareWhere(key: string | number) {
  const value = String(key);
  if (!/^\d+$/.test(value)) return eq(shares.shareCode, -1);
  const shareCode = Number(value);
  if (!Number.isSafeInteger(shareCode) || !isValidPublicShareCode(shareCode)) return eq(shares.shareCode, -1);
  return eq(shares.shareCode, shareCode);
}

type PublicDocRecord = {
  id: number;
  docUid: string;
  ownerId: number;
  ownerStatus: "active" | "disabled" | null;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  contentHtml: string;
  contentJson: string;
  contentJsonCiphertext: string | null;
  contentJsonIv: string | null;
  contentJsonTag: string | null;
  contentJsonKeyVersion: string | null;
  contentHtmlCiphertext: string | null;
  contentHtmlIv: string | null;
  contentHtmlTag: string | null;
  contentHtmlKeyVersion: string | null;
  updatedAt: Date;
  status: "draft" | "published" | "archived";
  deletedAt: Date | null;
  ownerRole: "user" | "doc_admin" | "super_admin" | null;
};

export type PublicShareResolution =
  | { ok: false; reason: "missing" | "disabled" | "expired" | "deleted" }
  | { ok: true; share: typeof shares.$inferSelect; doc: PublicDocRecord; protected: boolean };

function publicDocSelect() {
  return {
    id: docs.id,
    docUid: docs.docUid,
    ownerId: docs.ownerId,
    ownerStatus: users.status,
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
    ownerRole: docs.ownerRole
  };
}

// ===== 分享页秒开优化：缓存解密结果 =====
interface DecryptedDocCache {
  doc: PublicDocRecord;
  decryptedAt: number;
}

const DECRYPT_CACHE_TTL_MS = 30 * 1000; // 30秒解密缓存
const DECRYPT_CACHE_MAX_SIZE = 200;
const decryptedDocCache = new Map<number, DecryptedDocCache>();

function getCachedDecryptedDoc(docId: number): PublicDocRecord | null {
  const cached = decryptedDocCache.get(docId);
  if (!cached) return null;
  if (Date.now() - cached.decryptedAt > DECRYPT_CACHE_TTL_MS) {
    decryptedDocCache.delete(docId);
    return null;
  }
  return cached.doc;
}

function setCachedDecryptedDoc(docId: number, doc: PublicDocRecord) {
  if (decryptedDocCache.size >= DECRYPT_CACHE_MAX_SIZE) {
    const entries = Array.from(decryptedDocCache.entries());
    entries.sort((a, b) => a[1].decryptedAt - b[1].decryptedAt);
    const deleteCount = Math.ceil(entries.length * 0.3);
    for (let i = 0; i < deleteCount; i++) {
      decryptedDocCache.delete(entries[i][0]);
    }
  }
  decryptedDocCache.set(docId, { doc, decryptedAt: Date.now() });
}

function invalidateDecryptedDocCache(docId?: number) {
  if (docId) {
    decryptedDocCache.delete(docId);
  } else {
    decryptedDocCache.clear();
  }
}

export { invalidateDecryptedDocCache };

export async function resolvePublicShare(shareKey: string | number): Promise<PublicShareResolution> {
  // ===== 分享页秒开优化：并行查询 shares 和 docs =====
  const [share, docRecord] = await Promise.all([
    dbGet<typeof shares.$inferSelect>(db
      .select()
      .from(shares)
      .where(shareWhere(shareKey))
      .limit(1)),
    dbGet<PublicDocRecord>(db
      .select(publicDocSelect())
      .from(docs)
      .leftJoin(users, eq(docs.ownerId, users.id))
      .where(sql`${docs.id} = (SELECT doc_id FROM shares WHERE ${shareWhere(shareKey)} LIMIT 1)`)
      .limit(1))
  ]);

  if (!share) return { ok: false, reason: "missing" };
  if (!share.isEnabled || share.reviewStatus !== "approved") return { ok: false, reason: "disabled" };
  if (share.expireAt && share.expireAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  // ===== 分享页秒开优化：先检查数据库中的删除状态，再考虑缓存 =====
  if (!docRecord) return { ok: false, reason: "missing" };
  if (docRecord.ownerStatus !== "active") return { ok: false, reason: "disabled" };
  if (docRecord.status !== "published") return { ok: false, reason: "disabled" };

  // 如果数据库中已删除，永不使用缓存
  if (docRecord.deletedAt) {
    invalidateDecryptedDocCache(share.docId);
    return { ok: false, reason: "deleted" };
  }

  // 检查缓存
  const docId = share.docId;
  let cachedDoc = getCachedDecryptedDoc(docId);

  if (cachedDoc && !cachedDoc.deletedAt) {
    // 缓存命中且未删除，直接使用
    if (isUserOwnedDoc(cachedDoc) && !isUserShareCode(share.shareCode)) return { ok: false, reason: "missing" };
    if (!isUserOwnedDoc(cachedDoc) && !isAdminShareCode(share.shareCode)) return { ok: false, reason: "missing" };
    return { ok: true, share, doc: cachedDoc, protected: !!share.passwordHash };
  }

  // 解密并缓存
  const decryptedDoc = decryptDocumentRecord(docRecord);
  setCachedDecryptedDoc(docId, decryptedDoc);

  if (decryptedDoc.deletedAt) return { ok: false, reason: "deleted" };
  if (isUserOwnedDoc(decryptedDoc) && !isUserShareCode(share.shareCode)) return { ok: false, reason: "missing" };
  if (!isUserOwnedDoc(decryptedDoc) && !isAdminShareCode(share.shareCode)) return { ok: false, reason: "missing" };

  return { ok: true, share, doc: decryptedDoc, protected: !!share.passwordHash };
}

export async function getPublicShare(shareKey: string | number, countView = false) {
  const resolved = await resolvePublicShare(shareKey);
  if (!resolved.ok) return null;
  if (countView) {
    await dbRun(db.update(shares).set({ viewCount: sql`${shares.viewCount} + 1`, updatedAt: now() }).where(eq(shares.id, resolved.share.id)));
  }
  return resolved;
}

export function publicDocPayload(data: NonNullable<Awaited<ReturnType<typeof getPublicShare>>>, includeContent: boolean) {
  if (!includeContent) return {};
  return {
    title: data.doc.title,
    summary: data.doc.summary,
    coverUrl: data.doc.coverUrl,
    updatedAt: data.doc.updatedAt,
    contentHtml: sanitizeDocumentHtml(data.doc.contentHtml)
  };
}

export async function recordPublicShareView(shareId: number) {
  await dbRun(db.update(shares).set({ viewCount: sql`${shares.viewCount} + 1`, updatedAt: now() }).where(eq(shares.id, shareId)));
}

function base64ToBase64url(value: string) {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return normalized + "=".repeat((4 - normalized.length % 4) % 4);
}

function encryptShareAccessJwt(token: string) {
  const [version, iv, tag, body] = encryptValue(token, env.configEncryptionKey).split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unable to encrypt share access token.");
  return ["CDS1", iv, tag, body].map((part, index) => index === 0 ? part : base64ToBase64url(part)).join(".");
}

function decryptShareAccessJwt(token: string) {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "CDS1") throw new Error("Invalid share access token.");
  return decryptValue(`v1:${base64urlToBase64(parts[1]!)}:${base64urlToBase64(parts[2]!)}:${base64urlToBase64(parts[3]!)}`, env.configEncryptionKey);
}

export function signShareAccessToken(share: typeof shares.$inferSelect, docId: number) {
  const token = jwt.sign({ shareId: share.id, docId }, env.jwtSecret, {
    expiresIn: "30m",
    audience: "chendoc-public-share",
    issuer: "chendoc"
  });
  return encryptShareAccessJwt(token);
}

export function verifyShareAccessToken(token: string | undefined, share: typeof shares.$inferSelect, docId: number) {
  if (!token) return false;
  try {
    const payload = shareAccessTokenSchema.parse(jwt.verify(decryptShareAccessJwt(token), env.jwtSecret, {
      audience: "chendoc-public-share",
      issuer: "chendoc"
    }));
    return payload.shareId === share.id && payload.docId === docId;
  } catch {
    return false;
  }
}

function sharePasswordAttemptKey(shareKey: string | number, meta: { ip?: string; userAgent?: string | string[] }) {
  return `${String(shareKey).toLowerCase()}|${meta.ip || "unknown"}`;
}

function cleanupSharePasswordAttempts(nowMs = Date.now()) {
  for (const [key, state] of sharePasswordAttempts) {
    if (state.lockedUntil > nowMs) continue;
    if (nowMs - state.firstAt > SHARE_PASSWORD_WINDOW_MS) sharePasswordAttempts.delete(key);
  }
  while (sharePasswordAttempts.size >= SHARE_PASSWORD_ATTEMPT_MAX_SIZE) {
    sharePasswordAttempts.delete(sharePasswordAttempts.keys().next().value!);
  }
}

function writeSharePasswordAudit(action: string, shareKey: string | number, meta: { ip?: string; userAgent?: string | string[] }) {
  enqueueSecurityLog({
    userId: null,
    action,
    targetType: "share",
    targetId: String(shareKey),
    ip: meta.ip,
    userAgent: Array.isArray(meta.userAgent) ? meta.userAgent.join(", ") : meta.userAgent,
    statusCode: action === "share.password.locked" ? 429 : 401,
    message: action
  });
}

async function assertSharePasswordAllowed(shareKey: string | number, meta: { ip?: string; userAgent?: string | string[] }) {
  const nowMs = Date.now();
  cleanupSharePasswordAttempts(nowMs);
  const state = sharePasswordAttempts.get(sharePasswordAttemptKey(shareKey, meta));
  if (!state) return;
  if (state.lockedUntil > nowMs) {
    await writeSharePasswordAudit("share.password.locked", shareKey, meta);
    throw new ShareAccessError("SHARE_PASSWORD_LOCKED", "密码错误次数过多，请稍后再试", 429);
  }
  if (state.nextAllowedAt > nowMs) {
    throw new ShareAccessError("SHARE_PASSWORD_BACKOFF", "验证过于频繁，请稍后再试", 429);
  }
}

async function recordSharePasswordFailure(shareKey: string | number, meta: { ip?: string; userAgent?: string | string[] }) {
  const nowMs = Date.now();
  cleanupSharePasswordAttempts(nowMs);
  const key = sharePasswordAttemptKey(shareKey, meta);
  const state = sharePasswordAttempts.get(key) ?? { count: 0, firstAt: nowMs, nextAllowedAt: 0, lockedUntil: 0 };
  if (nowMs - state.firstAt > SHARE_PASSWORD_WINDOW_MS) {
    state.count = 0;
    state.firstAt = nowMs;
    state.nextAllowedAt = 0;
    state.lockedUntil = 0;
  }
  state.count += 1;
  if (state.count >= SHARE_PASSWORD_LOCK_THRESHOLD) {
    state.lockedUntil = nowMs + SHARE_PASSWORD_LOCK_MS;
    await writeSharePasswordAudit("share.password.locked", shareKey, meta);
  } else if (state.count >= SHARE_PASSWORD_BACKOFF_THRESHOLD) {
    state.nextAllowedAt = nowMs + Math.min(60, 2 ** Math.min(6, state.count - SHARE_PASSWORD_BACKOFF_THRESHOLD)) * 1000;
  }
  sharePasswordAttempts.set(key, state);
  await writeSharePasswordAudit("share.password.failure", shareKey, meta);
}

function clearSharePasswordFailure(shareKey: string | number, meta: { ip?: string; userAgent?: string | string[] }) {
  sharePasswordAttempts.delete(sharePasswordAttemptKey(shareKey, meta));
}

export async function verifySharePassword(shareKey: string | number, password: string, meta: { ip?: string; userAgent?: string | string[] } = {}) {
  await assertSharePasswordAllowed(shareKey, meta);
  const data = await getPublicShare(shareKey, false);
  if (!data) {
    await writeSharePasswordAudit("share.enumeration", shareKey, meta);
    return { ok: false };
  }
  if (!data?.share.passwordHash) return { ok: true };
  const ok = await verifyPassword(password, data.share.passwordHash);
  if (ok) clearSharePasswordFailure(shareKey, meta);
  else await recordSharePasswordFailure(shareKey, meta);
  return {
    ok,
    token: ok ? signShareAccessToken(data.share, data.doc.id) : undefined
  };
}
