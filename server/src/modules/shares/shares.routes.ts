import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireSuperAdmin } from "../../middleware/requireSuperAdmin.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import { enqueueDocumentLog, enqueueSecurityLog } from "../../utils/asyncLogQueue.js";
import {
  adminSharePayload,
  createOrGetShareByDocUid,
  deleteShare,
  getPublicShare,
  getShareByDocUid,
  listUserShareReviews,
  publicDocPayload,
  recordPublicShareView,
  reviewUserShare,
  updateShare,
  ShareAccessError,
  verifyShareAccessToken,
  verifySharePassword
} from "./shares.service.js";
import { invalidateShareHtmlCache } from "../public/share-html-cache.js";

function invalidateShareKeys(shareCode?: number | null, ...slugs: Array<string | null | undefined>) {
  if (shareCode) invalidateShareHtmlCache(shareCode);
  for (const slug of slugs) {
    if (slug) invalidateShareHtmlCache(slug);
  }
}

function ifNoneMatchHit(value: string | string[] | undefined, etag: string) {
  const header = Array.isArray(value) ? value.join(",") : value;
  if (!header) return false;
  const current = etag.replace(/^W\//, "");
  return header.split(",").some((candidate) => {
    const token = candidate.trim();
    return token === "*" || token.replace(/^W\//, "") === current;
  });
}

export async function sharesRoutes(app: FastifyInstance) {
  const publicShareRateLimit = { max: 30, timeWindow: "1 minute" };
  const superAdminOnly = [authenticate, requireSuperAdmin];
  const docUidSchema = z.string().trim().regex(/^[A-Za-z0-9]{16,32}$/);

  app.post("/api/docs/:docUid/share", { preHandler: authenticate }, async (request) => {
    const params = z.object({ docUid: docUidSchema }).parse(request.params);
    const existingShare = await getShareByDocUid(params.docUid, request.user!);
    const share = await createOrGetShareByDocUid(params.docUid, request.body, request.user!);
    if (!share) throw new Error("分享创建失败");
    enqueueDocumentLog({
      userId: request.user!.id,
      role: request.user!.role,
      docUid: params.docUid,
      ownerId: request.user!.id,
      action: "share",
      request
    });
    if (!existingShare) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "share.create",
        targetType: "share",
        targetId: share.id,
        ...auditMetaFromRequest(request)
      });
    }
    return { share: adminSharePayload(share) };
  });

  app.patch("/api/shares/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const docLog = await updateShare(params.id, request.body, request.user!);
    invalidateShareKeys(docLog.shareCode, docLog.oldCustomSlug, docLog.customSlug);
    enqueueDocumentLog({
      userId: request.user!.id,
      role: request.user!.role,
      docUid: docLog.docUid,
      ownerId: docLog.ownerId,
      action: "share",
      request
    });
    return { ok: true };
  });

  app.get("/api/shares/doc/:docUid", { preHandler: authenticate }, async (request) => {
    const params = z.object({ docUid: docUidSchema }).parse(request.params);
    const share = await getShareByDocUid(params.docUid, request.user!);
    return { share: share ? adminSharePayload(share) : null };
  });

  app.delete("/api/shares/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const docLog = await deleteShare(params.id, request.user!);
    invalidateShareKeys(docLog.shareCode, docLog.customSlug);
    enqueueDocumentLog({
      userId: request.user!.id,
      role: request.user!.role,
      docUid: docLog.docUid,
      ownerId: docLog.ownerId,
      action: "share",
      request
    });
    await writeAuditLog({
      userId: request.user!.id,
      action: "share.delete",
      targetType: "share",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });

  app.get("/api/admin/share-reviews", { preHandler: superAdminOnly }, async () => ({ shares: await listUserShareReviews() }));

  app.post("/api/admin/share-reviews/:id/review", { preHandler: superAdminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = z.object({ action: z.enum(["approve", "reject"]) }).passthrough().parse(request.body);
    await reviewUserShare(params.id, request.body, request.user!.id);
    await writeAuditLog({
      userId: request.user!.id,
      action: body.action === "approve" ? "share.review.approve" : "share.review.reject",
      targetType: "share",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });

  app.get("/api/public/r/:shareKey", { config: { rateLimit: publicShareRateLimit } }, async (request, reply) => {
    const params = z.object({ shareKey: z.string().trim().min(1).max(64) }).parse(request.params);
    const data = await getPublicShare(params.shareKey);
    if (!data) {
      enqueueSecurityLog({ action: "share.public.unavailable", targetType: "share", targetId: params.shareKey, ip: request.ip, statusCode: 404, message: "public share unavailable" });
      return reply.header("Cache-Control", "no-store").code(404).send({ message: "分享不存在或已关闭" });
    }
    const authToken = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice("Bearer ".length)
      : undefined;
    const canReadContent = !data.protected || verifyShareAccessToken(authToken, data.share, data.doc.id);
    const payloadData = data;
    if (canReadContent) {
      await recordPublicShareView(data.share.id);
      const etag = `"${createHash("sha1").update(`${payloadData.doc.id}:${payloadData.doc.updatedAt.getTime()}`).digest("base64url")}"`;
      reply.header("ETag", etag);
      reply.header("Last-Modified", payloadData.doc.updatedAt.toUTCString());
      reply.header("Cache-Control", data.protected ? "private, no-store" : "private, no-cache, must-revalidate");
      if (data.protected) reply.header("Vary", "Authorization");
      if (ifNoneMatchHit(request.headers["if-none-match"], etag)) return reply.code(304).send();
    } else {
      reply.header("Cache-Control", "no-store");
      reply.header("Vary", "Authorization");
    }
    enqueueSecurityLog({ action: "share.public.access", targetType: "share", targetId: params.shareKey, ip: request.ip, statusCode: 200, message: data.protected ? "protected share access" : "public share access" });
    return {
      doc: publicDocPayload(payloadData, canReadContent),
      share: {
        shareId: data.share.shareCode,
        customSlug: data.share.customSlug,
        viewCount: data.share.viewCount
      },
      protected: data.protected,
      unlocked: canReadContent
    };
  });

  app.post("/api/public/r/:shareKey/verify-password", { config: { rateLimit: publicShareRateLimit } }, async (request, reply) => {
    const params = z.object({ shareKey: z.string().trim().min(1).max(64) }).parse(request.params);
    const body = z.object({ password: z.string().min(8).max(80) }).parse(request.body);
    try {
      return await verifySharePassword(params.shareKey, body.password, {
        ip: request.ip,
        userAgent: request.headers["user-agent"]
      });
    } catch (error) {
      if (error instanceof ShareAccessError) {
        return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      }
      throw error;
    }
  });
}
