// ChenDoc v3.0.0 - 文档评论服务

import { docComments, docCommentReactions, docs, users } from "./comments.repo.js";
export { docComments, docCommentReactions, docs, users };

import {
  listCommentsByDocUid,
  getCommentById,
  getCommentReactions,
  getUserReaction,
  getReplyCount,
  insertComment,
  updateCommentById,
  softDeleteCommentById,
  softDeleteRepliesByParentId,
  deleteReactionsByCommentId,
  upsertReaction,
  listAllComments,
  countComments,
  batchSoftDeleteComments,
  batchDeleteReactions,
  getDocOwnerId,
  getUsernameById,
} from "./comments.repo.js";
import type { DocumentActor } from "../docs/documentAccess.js";

export interface Comment {
  id: number;
  docUid: string;
  parentId: number | null;
  userId: number;
  userName?: string;
  content: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionText: string | null;
  status: "active" | "hidden" | "deleted";
  reactions?: Reaction[];
  replyCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reaction {
  reaction: string;
  count: number;
  userReacted?: boolean;
}

export interface CreateCommentInput {
  docUid: string;
  content: string;
  parentId?: number;
  selectionStart?: number;
  selectionEnd?: number;
  selectionText?: string;
}

export interface UpdateCommentInput {
  content?: string;
  status?: "active" | "hidden" | "deleted";
}

async function hasDocumentAccess(actor: DocumentActor, docUid: string): Promise<boolean> {
  if (actor.isSuperAdmin) return true;
  const doc = await getDocOwnerId(docUid);
  return doc !== undefined && doc.ownerId === actor.id;
}

export async function listComments(
  actor: DocumentActor,
  docUid: string
): Promise<Comment[]> {
  const hasAccess = await hasDocumentAccess(actor, docUid);
  if (!hasAccess && !actor.isSuperAdmin) {
    return [];
  }

  const rows = await listCommentsByDocUid(docUid);

  const comments: Comment[] = [];
  for (const row of rows) {
    const reactions = await getReactionsWithUserReaction(row.id, actor.id);
    const replyCount = await getReplyCount(row.id);

    comments.push({
      id: row.id,
      docUid: row.docUid,
      parentId: row.parentId,
      userId: row.userId,
      userName: row.username || "未知用户",
      content: row.content,
      selectionStart: row.selectionStart,
      selectionEnd: row.selectionEnd,
      selectionText: row.selectionText,
      status: row.status as "active" | "hidden" | "deleted",
      reactions,
      replyCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  return comments;
}

async function getReactionsWithUserReaction(commentId: number, currentUserId?: number): Promise<Reaction[]> {
  const rows = await getCommentReactions(commentId);
  let userReaction: string | null = null;
  if (currentUserId) {
    const existing = await getUserReaction(commentId, currentUserId);
    if (existing) userReaction = existing.reaction;
  }
  return rows.map(row => ({
    reaction: row.reaction,
    count: Number(row.count),
    userReacted: userReaction === row.reaction,
  }));
}

export async function createComment(
  actor: DocumentActor,
  input: CreateCommentInput
): Promise<Comment> {
  if (!actor.isSuperAdmin && actor.role !== "admin") {
    throw new Error("只有管理员可以发表评论");
  }

  const hasAccess = await hasDocumentAccess(actor, input.docUid);
  if (!hasAccess && !actor.isSuperAdmin) {
    throw new Error("无权在此文档添加评论");
  }

  const userRow = await getUsernameById(actor.id);
  const userName = userRow?.username || "未知用户";

  const now = new Date();
  const row = await insertComment({
    docUid: input.docUid,
    parentId: input.parentId || null,
    userId: actor.id,
    content: input.content,
    selectionStart: input.selectionStart || null,
    selectionEnd: input.selectionEnd || null,
    selectionText: input.selectionText || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: row.id,
    docUid: row.docUid,
    parentId: row.parentId,
    userId: row.userId,
    userName,
    content: row.content,
    selectionStart: row.selectionStart,
    selectionEnd: row.selectionEnd,
    selectionText: row.selectionText,
    status: row.status as "active" | "hidden" | "deleted",
    reactions: [],
    replyCount: 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function updateComment(
  actor: DocumentActor,
  commentId: number,
  input: UpdateCommentInput
): Promise<Comment | null> {
  const existing = await getCommentById(commentId);
  if (!existing) return null;

  const isAuthor = existing.userId === actor.id;
  const isAdminOrSuperAdmin = actor.isSuperAdmin || actor.role === "admin";
  if (!isAuthor && !isAdminOrSuperAdmin) {
    throw new Error("无权修改此评论");
  }

  const now = new Date();
  const row = await updateCommentById(commentId, {
    ...(input.content !== undefined && { content: input.content }),
    ...(input.status !== undefined && { status: input.status }),
    updatedAt: now,
  });

  const reactions = await getReactionsWithUserReaction(row.id, actor.id);
  const replyCount = await getReplyCount(row.id);

  return {
    id: row.id,
    docUid: row.docUid,
    parentId: row.parentId,
    userId: row.userId,
    content: row.content,
    selectionStart: row.selectionStart,
    selectionEnd: row.selectionEnd,
    selectionText: row.selectionText,
    status: row.status as "active" | "hidden" | "deleted",
    reactions,
    replyCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function deleteComment(
  actor: DocumentActor,
  commentId: number
): Promise<boolean> {
  const existing = await getCommentById(commentId);
  if (!existing) return false;

  const isAuthor = existing.userId === actor.id;
  const isAdminOrSuperAdmin = actor.isSuperAdmin || actor.role === "admin";
  if (!isAuthor && !isAdminOrSuperAdmin) {
    throw new Error("无权删除此评论");
  }

  await softDeleteCommentById(commentId, new Date());
  return true;
}

export interface ListCommentsOptions {
  page?: number;
  pageSize?: number;
  docUid?: string;
  status?: "active" | "hidden" | "deleted";
  userId?: number;
  keyword?: string;
}

export interface ListCommentsResult {
  comments: Comment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listAllCommentsService(
  actor: DocumentActor,
  options: ListCommentsOptions = {}
): Promise<ListCommentsResult> {
  if (!actor.isSuperAdmin && actor.role !== "admin") {
    throw new Error("无权访问评论管理");
  }

  const {
    page = 1,
    pageSize = 20,
    docUid,
    status,
    userId,
    keyword,
  } = options;

  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listAllComments({ docUid, status, userId, keyword, pageSize, offset }),
    countComments({ docUid, status, userId, keyword }),
  ]);

  const comments: Comment[] = [];
  for (const row of rows) {
    const reactions = await getReactionsWithUserReaction(row.id);
    const replyCount = await getReplyCount(row.id);

    comments.push({
      id: row.id,
      docUid: row.docUid,
      parentId: row.parentId,
      userId: row.userId,
      userName: row.username || "未知用户",
      content: row.content,
      selectionStart: row.selectionStart,
      selectionEnd: row.selectionEnd,
      selectionText: row.selectionText,
      status: row.status as "active" | "hidden" | "deleted",
      reactions,
      replyCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  return {
    comments,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function deleteCommentAdmin(
  actor: DocumentActor,
  commentId: number
): Promise<boolean> {
  if (!actor.isSuperAdmin && actor.role !== "admin") {
    throw new Error("无权删除评论");
  }

  const existing = await getCommentById(commentId);
  if (!existing) return false;

  const now = new Date();
  await softDeleteCommentById(commentId, now);
  await softDeleteRepliesByParentId(commentId, now);
  await deleteReactionsByCommentId(commentId);
  return true;
}

export async function deleteCommentsBatch(
  actor: DocumentActor,
  commentIds: number[]
): Promise<{ deleted: number }> {
  if (!actor.isSuperAdmin && actor.role !== "admin") {
    throw new Error("无权删除评论");
  }
  if (commentIds.length === 0) return { deleted: 0 };

  const now = new Date();
  await batchSoftDeleteComments(commentIds, now);
  await batchDeleteReactions(commentIds);
  return { deleted: commentIds.length };
}

export async function toggleReaction(
  actor: DocumentActor,
  commentId: number,
  reaction: "like" | "dislike"
): Promise<Reaction[]> {
  const comment = await getCommentById(commentId);
  if (!comment) {
    throw new Error("评论不存在");
  }

  const now = new Date();
  await upsertReaction(commentId, actor.id, reaction, now);
  return getReactionsWithUserReaction(commentId, actor.id);
}
