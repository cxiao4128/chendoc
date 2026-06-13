import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireSuperAdmin } from "../../middleware/requireSuperAdmin.js";
import { requireDangerVerification } from "../auth/dangerVerification.service.js";
import { dangerDeleteDoc, findDocByUid } from "./danger.service.js";

export async function dangerRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireSuperAdmin];
  const dangerousAdmin = [authenticate, requireSuperAdmin, requireDangerVerification];

  const docUidParamSchema = z.object({ docUid: z.string().trim().regex(/^[A-Za-z0-9]{16,32}$/) });

  app.get("/api/admin/docs/by-uid/:docUid", { preHandler: adminOnly }, async (request, reply) => {
    const params = docUidParamSchema.parse(request.params);
    const doc = await findDocByUid(params.docUid);
    if (!doc) return reply.code(404).send({ message: "文档不存在" });
    return { doc };
  });

  app.delete("/api/admin/docs/by-uid/:docUid", { preHandler: dangerousAdmin }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    await dangerDeleteDoc({
      docUid: params.docUid,
      userId: request.user!.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"]
    });
    return { ok: true };
  });
}
