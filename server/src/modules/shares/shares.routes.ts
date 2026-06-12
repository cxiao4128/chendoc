import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import {
  adminSharePayload,
  createOrGetShare,
  deleteShare,
  getPublicShare,
  getShareByDoc,
  listUserShareReviews,
  publicDocPayload,
  reviewUserShare,
  updateShare,
  ShareAccessError,
  verifyShareAccessToken,
  verifySharePassword
} from "./shares.service.js";

export async function sharesRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];

  app.post("/api/docs/:id/share", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const existingShare = await getShareByDoc(params.id, request.user!);
    const share = await createOrGetShare(params.id, request.body, request.user!);
    if (!share) throw new Error("分享创建失败");
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
    await updateShare(params.id, request.body, request.user!);
    return { ok: true };
  });

  app.get("/api/shares/doc/:docId", { preHandler: authenticate }, async (request) => {
    const params = z.object({ docId: z.coerce.number().int().positive() }).parse(request.params);
    const share = await getShareByDoc(params.docId, request.user!);
    return { share: share ? adminSharePayload(share) : null };
  });

  app.delete("/api/shares/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    await deleteShare(params.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "share.delete",
      targetType: "share",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });

  app.get("/api/admin/share-reviews", { preHandler: adminOnly }, async () => ({ shares: await listUserShareReviews() }));

  app.post("/api/admin/share-reviews/:id/review", { preHandler: adminOnly }, async (request) => {
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

  app.get("/api/public/r/:shareKey", async (request, reply) => {
    const params = z.object({ shareKey: z.string().trim().min(1).max(64) }).parse(request.params);
    const data = await getPublicShare(params.shareKey);
    if (!data) return reply.code(404).send({ message: "分享不存在或已关闭" });
    const authToken = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice("Bearer ".length)
      : undefined;
    const canReadContent = !data.protected || verifyShareAccessToken(authToken, data.share, data.doc.id);
    const payloadData = canReadContent ? await getPublicShare(params.shareKey, true) ?? data : data;
    if (canReadContent) {
      const etag = `"${createHash("sha1").update(`${payloadData.doc.id}:${payloadData.doc.updatedAt.getTime()}`).digest("base64url")}"`;
      if (request.headers["if-none-match"] === etag) return reply.code(304).send();
      reply.header("ETag", etag);
      reply.header("Last-Modified", payloadData.doc.updatedAt.toUTCString());
      reply.header("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    } else {
      reply.header("Cache-Control", "no-store");
    }
    return {
      doc: publicDocPayload(payloadData, canReadContent),
      share: {
        shareCode: data.share.shareCode,
        customSlug: null,
        viewCount: data.share.viewCount
      },
      protected: data.protected,
      unlocked: canReadContent
    };
  });

  app.post("/api/public/r/:shareKey/verify-password", async (request, reply) => {
    const params = z.object({ shareKey: z.string().trim().min(1).max(64) }).parse(request.params);
    const body = z.object({ password: z.string().min(1).max(80) }).parse(request.body);
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
