import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { completeUpload, createPresignedUpload, deleteUpload, getUploadPolicy } from "./uploads.service.js";

export async function uploadsRoutes(app: FastifyInstance) {
  app.get("/api/uploads/policy", { preHandler: authenticate }, async () => ({ policy: getUploadPolicy() }));

  app.post("/api/uploads/presign", { preHandler: authenticate }, async (request) => createPresignedUpload(request.body));

  app.post("/api/uploads/complete", { preHandler: authenticate }, async (request) => ({
    upload: await completeUpload(request.user!.id, request.body)
  }));

  app.delete("/api/uploads/:id", { preHandler: [authenticate, requireAdmin] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { ok: true, ...(await deleteUpload(params.id)) };
  });
}
