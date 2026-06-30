// ChenDoc v2.10.0 - 标签路由
// RESTful API 路由

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { listTags, createTag, updateTag, deleteTag, getTag, TAG_COLORS } from "./tags.service.js";

export async function tagsRoutes(app: FastifyInstance) {
  // 认证中间件
  const authHandler = [authenticate];

  // 列出所有标签
  app.get("/api/tags", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const result = await listTags(user.id);
    return { tags: result };
  });

  // 获取单个标签
  app.get("/api/tags/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const tag = await getTag(params.id, user.id);
    if (!tag) {
      return { error: "标签不存在" };
    }
    return { tag };
  });

  // 创建标签
  app.post("/api/tags", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const body = z.object({
      name: z.string().min(1).max(32).trim(),
      color: z.string().optional(),
    }).parse(request.body || {});

    if (body.color && !TAG_COLORS.includes(body.color as typeof TAG_COLORS[number])) {
      return { error: "无效的标签颜色" };
    }

    const tag = await createTag(user.id, {
      name: body.name,
      color: body.color,
    });

    return { tag, status: 201 } as any;
  });

  // 更新标签
  app.patch("/api/tags/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const body = z.object({
      name: z.string().min(1).max(32).trim().optional(),
      color: z.string().optional(),
    }).parse(request.body || {});

    if (body.name === "" || (body.color && !TAG_COLORS.includes(body.color as typeof TAG_COLORS[number]))) {
      return { error: "参数无效" };
    }

    const tag = await updateTag(params.id, user.id, {
      name: body.name,
      color: body.color,
    });

    if (!tag) {
      return { error: "标签不存在" };
    }

    return { tag };
  });

  // 删除标签
  app.delete("/api/tags/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;

    const deleted = await deleteTag(params.id, user.id);

    if (!deleted) {
      return { error: "标签不存在" };
    }

    return { success: true };
  });

  // 获取可用颜色列表
  app.get("/api/tags/colors", async () => {
    return { colors: TAG_COLORS };
  });
}
