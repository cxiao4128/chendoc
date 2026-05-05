import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { getR2Config, getSiteConfig, listSettings, saveR2Config, saveSiteConfig, setSetting, testR2Connection } from "./settings.service.js";

export async function settingsRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];

  app.get("/api/public/settings/site", async () => ({ config: getSiteConfig() }));

  app.get("/api/settings", { preHandler: adminOnly }, async () => ({ settings: listSettings() }));

  app.get("/api/settings/site", { preHandler: adminOnly }, async () => ({ config: getSiteConfig() }));

  app.post("/api/settings/site", { preHandler: adminOnly }, async (request) => ({ config: saveSiteConfig(request.body) }));

  app.patch("/api/settings", { preHandler: adminOnly }, async (request) => {
    const body = z.object({
      items: z.array(z.object({
        key: z.string().min(1),
        value: z.string(),
        type: z.enum(["string", "json", "number", "boolean"]).default("string")
      }))
    }).parse(request.body);
    for (const item of body.items) setSetting(item.key, item.value, item.type);
    return { ok: true };
  });

  app.get("/api/settings/storage/r2", { preHandler: adminOnly }, async () => ({ config: getR2Config(false) }));

  app.post("/api/settings/storage/r2", { preHandler: adminOnly }, async (request) => ({ config: saveR2Config(request.body) }));

  app.post("/api/settings/storage/r2/test", { preHandler: adminOnly }, async (request) => {
    const body = z.object({ upload: z.boolean().optional().default(false) }).parse(request.body ?? {});
    return testR2Connection(body.upload);
  });
}
