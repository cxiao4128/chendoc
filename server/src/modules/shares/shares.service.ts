import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db } from "../../db/client.js";
import { docs, shares, users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { now } from "../../utils/date.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";

type Actor = { id: number; role: "admin" | "user" };

const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(48)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => !/^\d+$/.test(value), "custom slug cannot be all digits")
  .transform((value) => value.toLowerCase());

const shareCodeSchema = z.number().int().min(111).max(99999999);

const createShareSchema = z.object({
  isEnabled: z.boolean().optional(),
  password: z.string().max(80).optional().nullable(),
  expireAt: z.string().datetime().optional().nullable(),
  customSlug: slugSchema.optional().nullable(),
  shareCode: shareCodeSchema.optional().nullable()
});

const updateShareSchema = z.object({
  isEnabled: z.boolean().optional(),
  password: z.string().max(80).optional().nullable(),
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
  shareCode: z.number().int().min(111).max(99999999),
  docId: z.number().int().positive()
});

const reservedSlugs = new Set(["api", "admin", "login", "register", "assets", "fonts", "settings", "r"]);

function parseExpireAt(value?: string | null) {
  return value ? new Date(value) : null;
}

function assertSlugAvailable(slug: string | null | undefined, currentShareId?: number) {
  if (!slug) return;
  if (reservedSlugs.has(slug)) throw new Error("短链接已被系统保留");
  const existing = db.select({ id: shares.id }).from(shares).where(eq(shares.customSlug, slug)).limit(1).get();
  if (existing && existing.id !== currentShareId) throw new Error("短链接已被占用");
}

function assertShareCodeAvailable(shareCode: number | null | undefined, currentShareId?: number) {
  if (!shareCode) return;
  const existing = db.select({ id: shares.id }).from(shares).where(eq(shares.shareCode, shareCode)).limit(1).get();
  if (existing && existing.id !== currentShareId) throw new Error("分享数字已被占用");
}

function nextAdminShareCode() {
  const current = db
    .select({ code: sql<number>`coalesce(max(${shares.shareCode}), 110)` })
    .from(shares)
    .where(sql`${shares.shareCode} < 10000`)
    .get();
  const next = Number(current?.code ?? 110) + 1;
  if (next > 9999) throw new Error("管理员分享编号已用完");
  return next;
}

function randomUserShareCode() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = randomInt(10000000, 100000000);
    const existing = db.select({ id: shares.id }).from(shares).where(eq(shares.shareCode, code)).limit(1).get();
    if (!existing) return code;
  }
  throw new Error("分享数字生成失败，请稍后重试");
}

function docWithOwner(docId: number) {
  const row = db
    .select({
      id: docs.id,
      title: docs.title,
      createdBy: docs.createdBy,
      deletedAt: docs.deletedAt,
      ownerRole: users.role,
      ownerName: users.username
    })
    .from(docs)
    .leftJoin(users, eq(docs.createdBy, users.id))
    .where(and(eq(docs.id, docId), isNull(docs.deletedAt)))
    .limit(1)
    .get();
  if (!row) throw new Error("文档不存在");
  return row;
}

function shareWithDoc(shareId: number) {
  const share = db.select().from(shares).where(eq(shares.id, shareId)).limit(1).get();
  if (!share) throw new Error("分享不存在");
  return { share, doc: docWithOwner(share.docId) };
}

function isUserOwnedDoc(doc: { ownerRole: "admin" | "user" | null }) {
  return doc.ownerRole === "user";
}

function assertCanManageDocShare(actor: Actor, doc: { createdBy: number | null }) {
  if (actor.role === "admin") return;
  if (doc.createdBy === actor.id) return;
  throw new Error("文档不存在");
}

export async function createOrGetShare(docId: number, input: unknown, actor: Actor = { id: 1, role: "admin" }) {
  const body = createShareSchema.parse(input ?? {});
  const doc = docWithOwner(docId);
  assertCanManageDocShare(actor, doc);

  const existing = db.select().from(shares).where(eq(shares.docId, docId)).limit(1).get();
  if (existing) return existing;

  const userOwned = isUserOwnedDoc(doc);
  if (actor.role !== "admin" && (body.customSlug || body.shareCode)) {
    throw new Error("普通用户不能自定义分享链接");
  }

  assertSlugAvailable(body.customSlug);
  assertShareCodeAvailable(body.shareCode ?? undefined);

  const isAdminDoc = !userOwned;
  const isAdminApprovingUserDoc = userOwned && actor.role === "admin";
  const createdAt = now();
  const result = db.insert(shares).values({
    docId,
    shareCode: body.shareCode ?? (userOwned ? randomUserShareCode() : nextAdminShareCode()),
    customSlug: actor.role === "admin" ? body.customSlug ?? null : null,
    passwordHash: body.password ? await hashPassword(body.password) : null,
    isEnabled: isAdminDoc || isAdminApprovingUserDoc ? body.isEnabled ?? false : false,
    reviewStatus: isAdminDoc || isAdminApprovingUserDoc ? "approved" : "pending",
    reviewNote: null,
    requestedBy: userOwned ? doc.createdBy ?? actor.id : null,
    reviewedBy: isAdminApprovingUserDoc ? actor.id : null,
    reviewedAt: isAdminApprovingUserDoc ? createdAt : null,
    expireAt: parseExpireAt(body.expireAt),
    viewCount: 0,
    createdAt,
    updatedAt: createdAt
  }).run();

  return db.select().from(shares).where(eq(shares.id, Number(result.lastInsertRowid))).limit(1).get();
}

export async function updateShare(id: number, input: unknown, actor: Actor = { id: 1, role: "admin" }) {
  const body = updateShareSchema.parse(input);
  const { share: current, doc } = shareWithDoc(id);
  assertCanManageDocShare(actor, doc);

  const userOwned = isUserOwnedDoc(doc);
  const patch: Partial<typeof shares.$inferInsert> = { updatedAt: now() };

  if (actor.role !== "admin") {
    if (body.customSlug !== undefined || body.shareCode !== undefined) {
      throw new Error("普通用户不能自定义分享链接");
    }
    if (body.isEnabled !== undefined) {
      if (body.isEnabled && current.reviewStatus === "approved") {
        patch.isEnabled = true;
      } else if (body.isEnabled) {
        patch.isEnabled = false;
        patch.reviewStatus = "pending";
        patch.reviewNote = null;
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
      assertShareCodeAvailable(body.shareCode, id);
      patch.shareCode = body.shareCode ?? current.shareCode;
    }
    if (body.customSlug !== undefined) {
      assertSlugAvailable(body.customSlug, id);
      patch.customSlug = body.customSlug || null;
    }
    if (userOwned && body.isEnabled) {
      patch.reviewStatus = "approved";
      patch.reviewNote = null;
      patch.reviewedBy = actor.id;
      patch.reviewedAt = now();
    }
  }

  if (body.password !== undefined) patch.passwordHash = body.password ? await hashPassword(body.password) : null;
  if (body.expireAt !== undefined) patch.expireAt = parseExpireAt(body.expireAt);

  db.update(shares).set(patch).where(eq(shares.id, id)).run();
}

export function getShareByDoc(docId: number, actor?: Actor) {
  if (actor) {
    const doc = docWithOwner(docId);
    assertCanManageDocShare(actor, doc);
  }
  return db.select().from(shares).where(eq(shares.docId, docId)).limit(1).get() ?? null;
}

export function adminSharePayload(share: typeof shares.$inferSelect) {
  return {
    id: share.id,
    docId: share.docId,
    shareCode: share.shareCode,
    customSlug: share.customSlug,
    isEnabled: share.isEnabled,
    reviewStatus: share.reviewStatus,
    reviewNote: share.reviewNote,
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

export function deleteShare(id: number, actor: Actor) {
  const { doc } = shareWithDoc(id);
  assertCanManageDocShare(actor, doc);
  db.delete(shares).where(eq(shares.id, id)).run();
}

export function listUserShareReviews() {
  return db
    .select({
      id: shares.id,
      docId: shares.docId,
      docTitle: docs.title,
      ownerId: docs.createdBy,
      ownerName: users.username,
      shareCode: shares.shareCode,
      customSlug: shares.customSlug,
      isEnabled: shares.isEnabled,
      reviewStatus: shares.reviewStatus,
      reviewNote: shares.reviewNote,
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
    .leftJoin(users, eq(docs.createdBy, users.id))
    .where(and(eq(users.role, "user"), isNull(docs.deletedAt)))
    .orderBy(sql`case ${shares.reviewStatus} when 'pending' then 0 when 'rejected' then 1 else 2 end`, sql`${shares.updatedAt} desc`)
    .all();
}

export async function reviewUserShare(id: number, input: unknown, adminId: number) {
  const body = reviewShareSchema.parse(input);
  const { share: current, doc } = shareWithDoc(id);
  if (!isUserOwnedDoc(doc)) throw new Error("管理员文档不需要审核");

  const patch: Partial<typeof shares.$inferInsert> = {
    reviewStatus: body.action === "approve" ? "approved" : "rejected",
    isEnabled: body.action === "approve",
    reviewNote: body.note ?? null,
    reviewedBy: adminId,
    reviewedAt: now(),
    updatedAt: now()
  };

  if (body.shareCode !== undefined) {
    assertShareCodeAvailable(body.shareCode, id);
    patch.shareCode = body.shareCode ?? current.shareCode;
  }
  if (body.customSlug !== undefined) {
    assertSlugAvailable(body.customSlug, id);
    patch.customSlug = body.customSlug || null;
  }

  db.update(shares).set(patch).where(eq(shares.id, id)).run();
}

function shareWhere(key: string | number) {
  const value = String(key);
  if (/^\d+$/.test(value)) return eq(shares.shareCode, Number(value));
  return eq(shares.customSlug, value.toLowerCase());
}

type PublicDocRecord = {
  id: number;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  contentHtml: string;
  updatedAt: Date;
  status: "draft" | "published" | "archived";
  deletedAt: Date | null;
};

export type PublicShareResolution =
  | { ok: false; reason: "missing" | "disabled" | "expired" | "deleted" }
  | { ok: true; share: typeof shares.$inferSelect; doc: PublicDocRecord; protected: boolean };

function publicDocSelect() {
  return {
    id: docs.id,
    title: docs.title,
    summary: docs.summary,
    coverUrl: docs.coverUrl,
    contentHtml: docs.contentHtml,
    updatedAt: docs.updatedAt,
    status: docs.status,
    deletedAt: docs.deletedAt
  };
}

export function resolvePublicShare(shareKey: string | number): PublicShareResolution {
  const share = db
    .select()
    .from(shares)
    .where(shareWhere(shareKey))
    .limit(1)
    .get();
  if (!share) return { ok: false, reason: "missing" };
  if (!share.isEnabled || share.reviewStatus !== "approved") return { ok: false, reason: "disabled" };
  if (share.expireAt && share.expireAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  const doc = db
    .select(publicDocSelect())
    .from(docs)
    .where(eq(docs.id, share.docId))
    .limit(1)
    .get();

  if (!doc) return { ok: false, reason: "missing" };
  if (doc.deletedAt) return { ok: false, reason: "deleted" };

  return { ok: true, share, doc, protected: !!share.passwordHash };
}

export function getPublicShare(shareKey: string | number, countView = false) {
  const resolved = resolvePublicShare(shareKey);
  if (!resolved.ok) return null;
  if (countView) {
    db.update(shares).set({ viewCount: sql`${shares.viewCount} + 1`, updatedAt: now() }).where(eq(shares.id, resolved.share.id)).run();
  }
  return resolved;
}

export function publicDocPayload(data: NonNullable<ReturnType<typeof getPublicShare>>, includeContent: boolean) {
  return {
    id: data.doc.id,
    title: data.doc.title,
    summary: data.doc.summary,
    coverUrl: data.doc.coverUrl,
    updatedAt: data.doc.updatedAt,
    status: data.doc.status,
    ...(includeContent ? { contentHtml: data.doc.contentHtml } : {})
  };
}

export function signShareAccessToken(shareCode: number, docId: number) {
  return jwt.sign({ shareCode, docId }, env.jwtSecret, {
    expiresIn: "30m",
    audience: "chendoc-public-share",
    issuer: "chendoc"
  });
}

export function verifyShareAccessToken(token: string | undefined, shareCode: number, docId: number) {
  if (!token) return false;
  try {
    const payload = shareAccessTokenSchema.parse(jwt.verify(token, env.jwtSecret, {
      audience: "chendoc-public-share",
      issuer: "chendoc"
    }));
    return payload.shareCode === shareCode && payload.docId === docId;
  } catch {
    return false;
  }
}

export async function verifySharePassword(shareKey: string | number, password: string) {
  const data = getPublicShare(shareKey, false);
  if (!data) return { ok: false };
  if (!data?.share.passwordHash) return { ok: true };
  const ok = await verifyPassword(password, data.share.passwordHash);
  return {
    ok,
    token: ok ? signShareAccessToken(data.share.shareCode, data.doc.id) : undefined
  };
}
