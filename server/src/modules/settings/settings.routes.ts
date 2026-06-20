import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { requireDangerVerification } from "../auth/dangerVerification.service.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import {
  deleteManagedUser,
  disableManagedUser,
  enableManagedUser,
  getManagedUser,
  getManagedUserPasswordView,
  listManagedUsers,
  promoteManagedUser,
  resetManagedUserPassword
} from "./settings.users.service.js";
import { getSiteConfig, saveSiteConfig } from "./settings.site.service.js";
import { getR2Config, saveR2Config, testR2Connection } from "./settings.storage.service.js";
import { listSettings, setSetting } from "./settings.core.service.js";
import { listOperationLogs } from "./settings.logs.service.js";
import {
  exportSystemConfig, getSystemOverview, runSystemMaintenanceAction
} from "./settings.maintenance.service.js";

export async function settingsRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];
  const dangerousAdmin = [authenticate, requireAdmin, requireDangerVerification];

  app.get("/api/public/settings/site", async () => ({ config: await getSiteConfig() }));

  app.get("/api/settings", { preHandler: adminOnly }, async () => ({ settings: await listSettings() }));

  app.get("/api/settings/operation-logs", { preHandler: adminOnly }, async () => ({ logs: await listOperationLogs() }));

  app.get("/api/settings/system/status", { preHandler: adminOnly }, async () => ({ status: await getSystemOverview() }));

  app.get("/api/settings/system/export", { preHandler: dangerousAdmin }, async (request) => {
    const result = await exportSystemConfig();
    await writeAuditLog({
      userId: request.user!.id,
      action: "system.export_config",
      targetType: "system",
      targetId: "config",
      ...auditMetaFromRequest(request)
    });
    return { export: result };
  });

  app.post("/api/settings/system/actions/:action", { preHandler: dangerousAdmin }, async (request) => {
    const params = z.object({
      action: z.enum(["cleanupExpiredSessions", "cleanupExpiredCaptchas", "cleanupExpiredLogs", "emptyTrash", "refreshStatus", "healthCheck"])
    }).parse(request.params);
    const result = await runSystemMaintenanceAction(params.action);
    await writeAuditLog({
      userId: request.user!.id,
      action: `system.${params.action}`,
      targetType: "system",
      targetId: params.action,
      ...auditMetaFromRequest(request)
    });
    return { result };
  });

  app.get("/api/admin/users", { preHandler: adminOnly }, async () => ({ users: await listManagedUsers() }));

  app.get("/api/admin/users/:id", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { user: await getManagedUser(params.id) };
  });

  app.post("/api/admin/users/:id/promote", { preHandler: dangerousAdmin }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = await promoteManagedUser(params.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "user.promote_admin",
      targetType: "user",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { user };
  });

  app.post("/api/admin/users/:id/disable", { preHandler: dangerousAdmin }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = await disableManagedUser(params.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "user.disable_login",
      targetType: "user",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { user };
  });

  app.post("/api/admin/users/:id/enable", { preHandler: dangerousAdmin }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = await enableManagedUser(params.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "user.enable_login",
      targetType: "user",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { user };
  });

  app.delete("/api/admin/users/:id", { preHandler: dangerousAdmin }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    await deleteManagedUser(params.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "user.delete",
      targetType: "user",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });

  app.get("/api/admin/users/:id/password", { preHandler: dangerousAdmin }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const password = await getManagedUserPasswordView(params.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "user.password.view",
      targetType: "user",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { password };
  });

  app.post("/api/admin/users/:id/password", { preHandler: dangerousAdmin }, async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = z.object({ password: z.string().min(1).max(128) }).parse(request.body);
    try {
      const user = await resetManagedUserPassword(params.id, body.password, request.user!);
      await writeAuditLog({
        userId: request.user!.id,
        action: "user.password.reset",
        targetType: "user",
        targetId: params.id,
        ...auditMetaFromRequest(request)
      });
      return { user };
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "修改用户密码失败" });
    }
  });

  app.get("/api/settings/site", { preHandler: adminOnly }, async () => ({ config: await getSiteConfig() }));

  app.post("/api/settings/site", { preHandler: dangerousAdmin }, async (request) => {
    const config = await saveSiteConfig(request.body);
    await writeAuditLog({
      userId: request.user!.id,
      action: "settings.site.update",
      targetType: "settings",
      targetId: "site",
      ...auditMetaFromRequest(request)
    });
    return { config };
  });

  app.patch("/api/settings", { preHandler: dangerousAdmin }, async (request) => {
    const body = z.object({
      items: z.array(z.object({
        key: z.string().min(1),
        value: z.string(),
        type: z.enum(["string", "json", "number", "boolean"]).default("string")
      }))
    }).parse(request.body);
    for (const item of body.items) await setSetting(item.key, item.value, item.type);
    await writeAuditLog({
      userId: request.user!.id,
      action: "settings.bulk_update",
      targetType: "settings",
      targetId: `count:${body.items.length}`,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });

  app.get("/api/settings/storage/r2", { preHandler: adminOnly }, async () => ({ config: await getR2Config(false) }));

  app.post("/api/settings/storage/r2", { preHandler: dangerousAdmin }, async (request) => {
    const config = await saveR2Config(request.body);
    await writeAuditLog({
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
    await writeAuditLog({
      userId: request.user!.id,
      action: body.upload ? "settings.r2.test_upload" : "settings.r2.test",
      targetType: "settings",
      targetId: "r2",
      ...auditMetaFromRequest(request)
    });
    return result;
  });
}
