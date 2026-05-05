import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { createInvite, createInviteBatch, deleteInvite, disableInvite, listInvites } from "./invites.service.js";

export async function invitesRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];

  app.get("/api/admin/invites", { preHandler: adminOnly }, async () => ({ invites: listInvites() }));

  app.post("/api/admin/invites", { preHandler: adminOnly }, async (request) => ({
    invite: createInvite(request.user!.id, request.body as never)
  }));

  app.post("/api/admin/invites/batch", { preHandler: adminOnly }, async (request) => ({
    invites: createInviteBatch(request.user!.id, request.body as never)
  }));

  app.patch("/api/admin/invites/:id/disable", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    disableInvite(params.id);
    return { ok: true };
  });

  app.delete("/api/admin/invites/:id", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    deleteInvite(params.id);
    return { ok: true };
  });
}
