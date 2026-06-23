import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireDangerVerification } from "../auth/dangerVerification.service.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import { completeUpload, createPresignedUpload, deleteUpload, getUploadPolicy } from "./uploads.service.js";

export async function uploadsRoutes(app: FastifyInstance) {
  app.get("/api/uploads/policy", { preHandler: authenticate }, async () => ({ policy: getUploadPolicy() }));

  app.post("/api/uploads/presign", { preHandler: authenticate }, async (request) => createPresignedUpload(request.user!.id, request.user!, request.body));

  app.post("/api/uploads/complete", { preHandler: authenticate }, async (request) => ({
    upload: await completeUpload(request.user!.id, request.user!, request.body)
  }));

  app.delete("/api/uploads/:id", { preHandler: [authenticate, requireDangerVerification] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const result = await deleteUpload(params.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "upload.delete",
      targetType: "upload",
      targetId: params.id,
      riskLevel: "high",
      detail: result,
      ...auditMetaFromRequest(request)
    });
    return { ok: true, ...result };
  });
}
