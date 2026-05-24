import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { dangerDeleteDoc, findDocById } from "./danger.service.js";

export async function dangerRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];

  app.get("/api/admin/docs/by-id/:id", { preHandler: adminOnly }, async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const doc = await findDocById(params.id);
    if (!doc) return reply.code(404).send({ message: "文档不存在" });
    return { doc };
  });

  app.delete("/api/admin/docs/by-id/:id", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    await dangerDeleteDoc({
      id: params.id,
      userId: request.user!.id,
      ip: request.ip,
      userAgent: request.headers["user-agent"]
    });
    return { ok: true };
  });
}
