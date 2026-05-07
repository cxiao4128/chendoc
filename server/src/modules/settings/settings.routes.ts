import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import {
  deleteManagedUser,
  disableManagedUser,
  enableManagedUser,
  getManagedUser,
  getR2Config,
  getSiteConfig,
  listManagedUsers,
  listOperationLogs,
  listSettings,
  promoteManagedUser,
  saveR2Config,
  saveSiteConfig,
  setSetting,
  testR2Connection
} from "./settings.service.js";

export async function settingsRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];

  app.get("/api/public/settings/site", async () => ({ config: getSiteConfig() }));

  app.get("/api/settings", { preHandler: adminOnly }, async () => ({ settings: listSettings() }));

  app.get("/api/settings/operation-logs", { preHandler: adminOnly }, async () => ({ logs: listOperationLogs() }));

  app.get("/api/admin/users", { preHandler: adminOnly }, async () => ({ users: listManagedUsers() }));

  app.get("/api/admin/users/:id", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { user: getManagedUser(params.id) };
  });

  app.post("/api/admin/users/:id/promote", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = promoteManagedUser(params.id);
    writeAuditLog({
      userId: request.user!.id,
      action: "user.promote_admin",
      targetType: "user",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { user };
  });

  app.post("/api/admin/users/:id/disable", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = disableManagedUser(params.id, request.user!.id);
    writeAuditLog({
      userId: request.user!.id,
      action: "user.disable_login",
      targetType: "user",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { user };
  });

  app.post("/api/admin/users/:id/enable", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = enableManagedUser(params.id);
    writeAuditLog({
      userId: request.user!.id,
      action: "user.enable_login",
      targetType: "user",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { user };
  });

  app.delete("/api/admin/users/:id", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    deleteManagedUser(params.id, request.user!.id);
    writeAuditLog({
      userId: request.user!.id,
      action: "user.delete",
      targetType: "user",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });

  app.get("/api/settings/site", { preHandler: adminOnly }, async () => ({ config: getSiteConfig() }));

  app.post("/api/settings/site", { preHandler: adminOnly }, async (request) => {
    const config = saveSiteConfig(request.body);
    writeAuditLog({
      userId: request.user!.id,
      action: "settings.site.update",
      targetType: "settings",
      targetId: "site",
      ...auditMetaFromRequest(request)
    });
    return { config };
  });

  app.patch("/api/settings", { preHandler: adminOnly }, async (request) => {
    const body = z.object({
      items: z.array(z.object({
        key: z.string().min(1),
        value: z.string(),
        type: z.enum(["string", "json", "number", "boolean"]).default("string")
      }))
    }).parse(request.body);
    for (const item of body.items) setSetting(item.key, item.value, item.type);
    writeAuditLog({
      userId: request.user!.id,
      action: "settings.bulk_update",
      targetType: "settings",
      targetId: `count:${body.items.length}`,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });

  app.get("/api/settings/storage/r2", { preHandler: adminOnly }, async () => ({ config: getR2Config(false) }));

  app.post("/api/settings/storage/r2", { preHandler: adminOnly }, async (request) => {
    const config = saveR2Config(request.body);
    writeAuditLog({
      userId: request.user!.id,
      action: "settings.r2.update",
      targetType: "settings",
      targetId: "r2",
      ...auditMetaFromRequest(request)
    });
    return { config };
  });

  app.post("/api/settings/storage/r2/test", { preHandler: adminOnly }, async (request) => {
    const body = z.object({ upload: z.boolean().optional().default(false) }).parse(request.body ?? {});
    const result = await testR2Connection(body.upload);
    writeAuditLog({
      userId: request.user!.id,
      action: body.upload ? "settings.r2.test_upload" : "settings.r2.test",
      targetType: "settings",
      targetId: "r2",
      ...auditMetaFromRequest(request)
    });
    return result;
  });
}
