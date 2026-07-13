/**
 * @fileoverview Comments 模块公共接口
 * @description 提供文档评论的 CRUD 操作和权限检查，作为跨模块通信的唯一入口
 *
 * 依赖说明：
 * - 依赖 docs 模块的访问控制检查（文档所有者判断）
 *
 * @module comments
 */

export type {
  Comment,
  Reaction,
  CreateCommentInput,
  UpdateCommentInput,
  ListCommentsOptions,
  ListCommentsResult,
} from "./comments.service.js";

export {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  listAllCommentsService,
  deleteCommentAdmin,
  deleteCommentsBatch,
  toggleReaction,
} from "./comments.service.js";
