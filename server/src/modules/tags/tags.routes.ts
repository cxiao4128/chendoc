// ChenDoc v2.10.0 - 标签路由增强版
// RESTful API 路由，包含层级、批量操作、合并功能

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  getTag,
  getTagTree,
  addTagsToDocs,
  removeTagsFromDocs,
  mergeTags,
  renameTag,
  getTagStats,
  TAG_COLORS,
  isValidColor,
} from "./tags.service.js";

export async function tagsRoutes(app: FastifyInstance) {
  const authHandler = [authenticate];

  // 获取标签树形结构
  app.get("/api/tags/tree", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const tree = await getTagTree(user.id);
    return { tags: tree };
  });

  // 列出所有标签（扁平）
  app.get("/api/tags", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const result = await listTags(user.id);
    return { tags: result };
  });

  // 获取标签使用统计
  app.get("/api/tags/stats", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const stats = await getTagStats(user.id);
    return { stats };
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

  // 创建标签（支持父子关系）
  app.post("/api/tags", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const body = z.object({
      name: z.string().min(1).max(32).trim(),
      color: z.string().optional(),
      parentId: z.number().int().positive().optional(),
    }).parse(request.body || {});

    if (body.color && !isValidColor(body.color)) {
      return { error: "无效的颜色格式，请使用 #RGB 或 #RRGGBB 格式" };
    }

    const tag = await createTag(user.id, {
      name: body.name,
      color: body.color,
      parentId: body.parentId,
    });

    return { tag, status: 201 } as any;
  });

  // 更新标签（支持修改父子关系）
  app.patch("/api/tags/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const body = z.object({
      name: z.string().min(1).max(32).trim().optional(),
      color: z.string().optional(),
      parentId: z.union([z.number().int().positive(), z.literal(null)]).optional(),
    }).parse(request.body || {});

    if (body.name === "") {
      return { error: "标签名称不能为空" };
    }
    if (body.color && !isValidColor(body.color)) {
      return { error: "无效的颜色格式" };
    }

    const tag = await updateTag(params.id, user.id, {
      name: body.name,
      color: body.color,
      parentId: body.parentId,
    });

    if (!tag) {
      return { error: "标签不存在或无法更新（可能形成循环引用）" };
    }

    return { tag };
  });

  // 重命名标签
  app.post("/api/tags/:id/rename", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const body = z.object({
      name: z.string().min(1).max(32).trim(),
    }).parse(request.body || {});

    const tag = await renameTag(user.id, params.id, body.name);
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

  // 合并标签
  app.post("/api/tags/merge", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const body = z.object({
      sourceTagId: z.number().int().positive(),
      targetTagId: z.number().int().positive(),
    }).parse(request.body || {});

    if (body.sourceTagId === body.targetTagId) {
      return { error: "不能将标签合并到自身" };
    }

    const result = await mergeTags(user.id, body.sourceTagId, body.targetTagId);
    if (!result) {
      return { error: "标签不存在" };
    }

    return { success: true, mergedCount: result.mergedCount };
  });

  // 批量添加标签到文档
  app.post("/api/tags/docs/add", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const body = z.object({
      tagIds: z.array(z.number().int().positive()).min(1),
      docIds: z.array(z.number().int().positive()).min(1),
    }).parse(request.body || {});

    const result = await addTagsToDocs(user.id, body.tagIds, body.docIds);
    return { updated: result.updated };
  });

  // 批量从文档移除标签
  app.post("/api/tags/docs/remove", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const body = z.object({
      tagIds: z.array(z.number().int().positive()).min(1),
      docIds: z.array(z.number().int().positive()).min(1),
    }).parse(request.body || {});

    const result = await removeTagsFromDocs(user.id, body.tagIds, body.docIds);
    return { updated: result.updated };
  });

  // 获取可用颜色列表（包含自定义颜色支持）
  app.get("/api/tags/colors", async () => {
    return { colors: TAG_COLORS };
  });
}
