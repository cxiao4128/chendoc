// ChenDoc v3.0.0 - 文档评论 API 路由

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  toggleReaction,
  listAllComments,
  deleteCommentAdmin,
  deleteCommentsBatch,
} from "./comments.service.js";

export async function commentsRoutes(app: FastifyInstance) {
  const authHandler = [authenticate];

  // 获取文档评论列表
  app.get("/api/docs/:docUid/comments", { preHandler: authHandler }, async (request) => {
    const params = z.object({
      docUid: z.string().min(1),
    }).parse(request.params);

    const actor = request.user!;
    const comments = await listComments(actor, params.docUid);

    return { comments };
  });

  // 创建评论
  app.post("/api/docs/:docUid/comments", { preHandler: authHandler }, async (request) => {
    const params = z.object({
      docUid: z.string().min(1),
    }).parse(request.params);

    const body = z.object({
      content: z.string().min(1).max(10000),
      parentId: z.number().int().positive().optional(),
      selectionStart: z.number().int().nonnegative().optional(),
      selectionEnd: z.number().int().nonnegative().optional(),
      selectionText: z.string().max(1000).optional(),
    }).parse(request.body);

    const actor = request.user!;
    const comment = await createComment(actor, {
      docUid: params.docUid,
      content: body.content,
      parentId: body.parentId,
      selectionStart: body.selectionStart,
      selectionEnd: body.selectionEnd,
      selectionText: body.selectionText,
    });

    return { comment };
  });

  // 更新评论
  app.patch("/api/comments/:commentId", { preHandler: authHandler }, async (request) => {
    const params = z.object({
      commentId: z.coerce.number().int().positive(),
    }).parse(request.params);

    const body = z.object({
      content: z.string().min(1).max(10000).optional(),
      status: z.enum(["active", "hidden", "deleted"]).optional(),
    }).parse(request.body);

    const actor = request.user!;
    const comment = await updateComment(actor, params.commentId, body);

    if (!comment) {
      return { error: "评论不存在" };
    }

    return { comment };
  });

  // 删除评论
  app.delete("/api/comments/:commentId", { preHandler: authHandler }, async (request) => {
    const params = z.object({
      commentId: z.coerce.number().int().positive(),
    }).parse(request.params);

    const actor = request.user!;
    const success = await deleteComment(actor, params.commentId);

    return { success };
  });

  // 添加/切换反应
  app.post("/api/comments/:commentId/reactions", { preHandler: authHandler }, async (request) => {
    const params = z.object({
      commentId: z.coerce.number().int().positive(),
    }).parse(request.params);

    const body = z.object({
      reaction: z.enum(["like", "dislike"]),
    }).parse(request.body);

    const actor = request.user!;
    const reactions = await toggleReaction(actor, params.commentId, body.reaction);

    return { reactions };
  });

  // ===== 后台管理端 =====

  // 获取所有评论（后台管理）
  app.get("/api/admin/comments", { preHandler: authHandler }, async (request) => {
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(100).default(20),
      docUid: z.string().optional(),
      status: z.enum(["active", "hidden", "deleted"]).optional(),
      userId: z.coerce.number().int().positive().optional(),
      keyword: z.string().optional(),
    }).parse(request.query);

    const actor = request.user!;
    const result = await listAllComments(actor, query);

    return result;
  });

  // 管理员删除单个评论
  app.delete("/api/admin/comments/:commentId", { preHandler: authHandler }, async (request) => {
    const params = z.object({
      commentId: z.coerce.number().int().positive(),
    }).parse(request.params);

    const actor = request.user!;
    const success = await deleteCommentAdmin(actor, params.commentId);

    return { success };
  });

  // 管理员批量删除评论
  app.post("/api/admin/comments/batch-delete", { preHandler: authHandler }, async (request) => {
    const body = z.object({
      commentIds: z.array(z.number().int().positive()).min(1).max(100),
    }).parse(request.body);

    const actor = request.user!;
    const result = await deleteCommentsBatch(actor, body.commentIds);

    return result;
  });
}
