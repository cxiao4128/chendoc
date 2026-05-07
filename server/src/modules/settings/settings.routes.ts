import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import { getR2Config, getSiteConfig, listOperationLogs, listSettings, saveR2Config, saveSiteConfig, setSetting, testR2Connection } from "./settings.service.js";

export async function settingsRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];

  app.get("/api/public/settings/site", async () => ({ config: getSiteConfig() }));

  app.get("/api/settings", { preHandler: adminOnly }, async () => ({ settings: listSettings() }));

  app.get("/api/settings/operation-logs", { preHandler: adminOnly }, async () => ({ logs: listOperationLogs() }));

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
