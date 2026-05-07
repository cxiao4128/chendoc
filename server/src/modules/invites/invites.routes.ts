import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import { createInvite, createInviteBatch, deleteInvite, disableInvite, listInvites } from "./invites.service.js";

export async function invitesRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];

  app.get("/api/admin/invites", { preHandler: adminOnly }, async () => ({ invites: listInvites() }));

  app.post("/api/admin/invites", { preHandler: adminOnly }, async (request) => {
    const invite = createInvite(request.user!.id, request.body as never);
    writeAuditLog({
      userId: request.user!.id,
      action: "invite.create",
      targetType: "invite",
      targetId: invite.id,
      ...auditMetaFromRequest(request)
    });
    return { invite };
  });

  app.post("/api/admin/invites/batch", { preHandler: adminOnly }, async (request) => {
    const invites = createInviteBatch(request.user!.id, request.body as never);
    writeAuditLog({
      userId: request.user!.id,
      action: "invite.batch_create",
      targetType: "invite",
      targetId: `count:${invites.length}`,
      ...auditMetaFromRequest(request)
    });
    return { invites };
  });

  app.patch("/api/admin/invites/:id/disable", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    disableInvite(params.id);
    writeAuditLog({
      userId: request.user!.id,
      action: "invite.disable",
      targetType: "invite",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });

  app.delete("/api/admin/invites/:id", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    deleteInvite(params.id);
    writeAuditLog({
      userId: request.user!.id,
      action: "invite.delete",
      targetType: "invite",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });
}
