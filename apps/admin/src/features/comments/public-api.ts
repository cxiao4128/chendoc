/**
 * features/comments/public-api.ts
 *
 * 评论域统一导出入口
 */

export { commentStatusTag, formatCommentDate, truncateCommentContent, useCommentModeration } from "./hooks/useCommentModeration";
export { formatCommentRelativeDate, useDocComments } from "./hooks/useDocComments";

export type { CommentFilterStatus } from "./hooks/useCommentModeration";
export type { Comment } from "@/services/api";
