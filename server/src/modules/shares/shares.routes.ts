import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
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
  verifyShareAccessToken,
  verifySharePassword
} from "./shares.service.js";

export async function sharesRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];

  app.post("/api/docs/:id/share", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const share = await createOrGetShare(params.id, request.body, request.user!);
    if (!share) throw new Error("分享创建失败");
    return { share: adminSharePayload(share) };
  });

  app.patch("/api/shares/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    await updateShare(params.id, request.body, request.user!);
    return { ok: true };
  });

  app.get("/api/shares/doc/:docId", { preHandler: authenticate }, async (request) => {
    const params = z.object({ docId: z.coerce.number().int().positive() }).parse(request.params);
    const share = getShareByDoc(params.docId, request.user!);
    return { share: share ? adminSharePayload(share) : null };
  });

  app.delete("/api/shares/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    deleteShare(params.id, request.user!);
    return { ok: true };
  });

  app.get("/api/admin/share-reviews", { preHandler: adminOnly }, async () => ({ shares: listUserShareReviews() }));

  app.post("/api/admin/share-reviews/:id/review", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    await reviewUserShare(params.id, request.body, request.user!.id);
    return { ok: true };
  });

  app.get("/api/public/r/:shareKey", async (request, reply) => {
    const params = z.object({ shareKey: z.string().trim().min(1).max(64) }).parse(request.params);
    const query = z.object({ accessToken: z.string().optional() }).parse(request.query);
    const data = getPublicShare(params.shareKey);
    if (!data) return reply.code(404).send({ message: "分享不存在或已关闭" });
    const authToken = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice("Bearer ".length)
      : undefined;
    const canReadContent = !data.protected || verifyShareAccessToken(query.accessToken ?? authToken, data.share.shareCode, data.doc.id);
    return {
      doc: publicDocPayload(data, canReadContent),
      share: {
        shareCode: data.share.shareCode,
        customSlug: data.share.customSlug,
        viewCount: data.share.viewCount
      },
      protected: data.protected,
      unlocked: canReadContent
    };
  });

  app.post("/api/public/r/:shareKey/verify-password", async (request) => {
    const params = z.object({ shareKey: z.string().trim().min(1).max(64) }).parse(request.params);
    const body = z.object({ password: z.string().min(1).max(80) }).parse(request.body);
    return verifySharePassword(params.shareKey, body.password);
  });
}
