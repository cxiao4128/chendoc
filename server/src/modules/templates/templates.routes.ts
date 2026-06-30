// ChenDoc v2.10.0 - 模板路由
// 提供模板的 CRUD 操作，支持云端同步

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import {
  listTemplates,
  listBuiltInTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "./templates.service.js";

export async function templatesRoutes(app: FastifyInstance) {
  // 认证中间件
  const authHandler = [authenticate];

  // 获取内置模板
  app.get("/api/templates/builtin", async () => {
    const builtins = await listBuiltInTemplates();
    return { templates: builtins };
  });

  // 列出用户模板
  app.get("/api/templates", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const templates = await listTemplates(user.id);
    return { templates };
  });

  // 获取单个模板
  app.get("/api/templates/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const template = await getTemplate(params.id, user.id);
    if (!template) {
      return { error: "模板不存在" };
    }
    return { template };
  });

  // 创建模板
  app.post("/api/templates", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const body = z.object({
      title: z.string().min(1).max(100).trim(),
      summary: z.string().max(500).optional(),
      html: z.string().min(1),
      contentJson: z.string().optional(),
      sort: z.number().int().optional(),
    }).parse(request.body || {});

    try {
      const template = await createTemplate(user.id, body);
      return { template, status: 201 } as any;
    } catch (e: any) {
      if (e.message?.includes("上限")) {
        return { error: e.message };
      }
      throw e;
    }
  });

  // 更新模板
  app.patch("/api/templates/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const body = z.object({
      title: z.string().min(1).max(100).trim().optional(),
      summary: z.string().max(500).optional(),
      html: z.string().min(1).optional(),
      contentJson: z.string().optional(),
      sort: z.number().int().optional(),
    }).parse(request.body || {});

    const template = await updateTemplate(params.id, user.id, body);
    if (!template) {
      return { error: "模板不存在" };
    }
    return { template };
  });

  // 删除模板
  app.delete("/api/templates/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;

    try {
      const deleted = await deleteTemplate(params.id, user.id);
      if (!deleted) {
        return { error: "模板不存在" };
      }
      return { success: true };
    } catch (e: any) {
      if (e.message?.includes("内置")) {
        return { error: e.message };
      }
      throw e;
    }
  });
}
