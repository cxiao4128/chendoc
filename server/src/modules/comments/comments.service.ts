// ChenDoc v3.0.0 - 文档评论服务

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, dbAll } from "../../db/client.js";
import { docComments, docCommentReactions, docs, users } from "../../db/schema.js";
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

// 检查用户是否有文档评论权限（仅管理员和超级管理员）
async function canComment(actor: DocumentActor): Promise<boolean> {
  return actor.isSuperAdmin === true || actor.role === "admin";
}

// 检查用户是否有文档访问权限
async function hasDocumentAccess(actor: DocumentActor, docUid: string): Promise<boolean> {
  if (actor.isSuperAdmin) return true;

  const result = await dbAll(
    db.select({ ownerId: docs.ownerId })
      .from(docs)
      .where(and(eq(docs.docUid, docUid), isNull(docs.deletedAt)))
      .limit(1)
  );

  return result.length > 0 && result[0].ownerId === actor.id;
}

// 获取文档评论列表
export async function listComments(
  actor: DocumentActor,
  docUid: string
): Promise<Comment[]> {
  // 检查访问权限
  const hasAccess = await hasDocumentAccess(actor, docUid);
  if (!hasAccess && !actor.isSuperAdmin) {
    return [];
  }

  // 获取评论（包含用户信息）
  const rows = await dbAll(
    db.select({
      id: docComments.id,
      docUid: docComments.docUid,
      parentId: docComments.parentId,
      userId: docComments.userId,
      username: users.username,
      content: docComments.content,
      selectionStart: docComments.selectionStart,
      selectionEnd: docComments.selectionEnd,
      selectionText: docComments.selectionText,
      status: docComments.status,
      createdAt: docComments.createdAt,
      updatedAt: docComments.updatedAt,
    })
      .from(docComments)
      .leftJoin(users, eq(docComments.userId, users.id))
      .where(eq(docComments.docUid, docUid))
      .orderBy(desc(docComments.createdAt))
  );

  // 获取每个评论的反应统计
  const comments: Comment[] = [];
  for (const row of rows) {
    const reactions = await getCommentReactions(row.id, actor.id);
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
      status: row.status,
      reactions,
      replyCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  return comments;
}

// 获取评论的反应统计
async function getCommentReactions(commentId: number, currentUserId?: number): Promise<Reaction[]> {
  const rows = await dbAll(
    db.select({
      reaction: docCommentReactions.reaction,
      count: sql<number>`count(*)`.as("count"),
    })
      .from(docCommentReactions)
      .where(eq(docCommentReactions.commentId, commentId))
      .groupBy(docCommentReactions.reaction)
  );

  // 检查当前用户是否已反应
  let userReaction: string | null = null;
  if (currentUserId) {
    const userReactionRow = await dbAll(
      db.select({ reaction: docCommentReactions.reaction })
        .from(docCommentReactions)
        .where(and(
          eq(docCommentReactions.commentId, commentId),
          eq(docCommentReactions.userId, currentUserId)
        ))
        .limit(1)
    );
    if (userReactionRow.length > 0) {
      userReaction = userReactionRow[0].reaction;
    }
  }

  return rows.map(row => ({
    reaction: row.reaction,
    count: Number(row.count),
    userReacted: userReaction === row.reaction,
  }));
}

// 获取回复数量
async function getReplyCount(commentId: number): Promise<number> {
  const result = await dbAll(
    db.select({ count: sql<number>`count(*)` })
      .from(docComments)
      .where(and(
        eq(docComments.parentId, commentId),
        eq(docComments.status, "active")
      ))
  );
  return Number(result[0]?.count || 0);
}

// 创建评论
export async function createComment(
  actor: DocumentActor,
  input: CreateCommentInput
): Promise<Comment> {
  // 检查评论权限（仅管理员和超级管理员）
  if (!actor.isSuperAdmin && actor.role !== "admin") {
    throw new Error("只有管理员可以发表评论");
  }

  // 检查访问权限
  const hasAccess = await hasDocumentAccess(actor, input.docUid);
  if (!hasAccess && !actor.isSuperAdmin) {
    throw new Error("无权在此文档添加评论");
  }

  // 获取用户名
  let userName = "未知用户";
  const userRows = await dbAll(
    db.select({ username: users.username })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1)
  );
  if (userRows.length > 0) {
    userName = userRows[0].username;
  }

  const now = new Date();
  const [row] = await dbAll(
    db.insert(docComments)
      .values({
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
      })
      .returning()
  );

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
    status: row.status,
    reactions: [],
    replyCount: 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// 更新评论
export async function updateComment(
  actor: DocumentActor,
  commentId: number,
  input: UpdateCommentInput
): Promise<Comment | null> {
  // 获取评论
  const [existing] = await dbAll(
    db.select()
      .from(docComments)
      .where(eq(docComments.id, commentId))
      .limit(1)
  );

  if (!existing) return null;

  // 检查权限（评论作者、管理员或超级管理员可以修改）
  const isAuthor = existing.userId === actor.id;
  const isAdminOrSuperAdmin = actor.isSuperAdmin || actor.role === "admin";
  if (!isAuthor && !isAdminOrSuperAdmin) {
    throw new Error("无权修改此评论");
  }

  const now = new Date();
  const [row] = await dbAll(
    db.update(docComments)
      .set({
        ...(input.content !== undefined && { content: input.content }),
        ...(input.status !== undefined && { status: input.status }),
        updatedAt: now,
      })
      .where(eq(docComments.id, commentId))
      .returning()
  );

  const reactions = await getCommentReactions(row.id, actor.id);
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
    status: row.status,
    reactions,
    replyCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// 删除评论（软删除）
export async function deleteComment(
  actor: DocumentActor,
  commentId: number
): Promise<boolean> {
  const [existing] = await dbAll(
    db.select()
      .from(docComments)
      .where(eq(docComments.id, commentId))
      .limit(1)
  );

  if (!existing) return false;

  // 检查权限（评论作者、管理员或超级管理员可以删除）
  const isAuthor = existing.userId === actor.id;
  const isAdminOrSuperAdmin = actor.isSuperAdmin || actor.role === "admin";
  if (!isAuthor && !isAdminOrSuperAdmin) {
    throw new Error("无权删除此评论");
  }

  await dbAll(
    db.update(docComments)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(docComments.id, commentId))
  );

  return true;
}

// ===== 后台管理功能 =====

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

// 获取所有评论（后台管理用）
export async function listAllComments(
  actor: DocumentActor,
  options: ListCommentsOptions = {}
): Promise<ListCommentsResult> {
  // 权限检查（仅管理员和超级管理员）
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

  const conditions: any[] = [];

  if (docUid) {
    conditions.push(eq(docComments.docUid, docUid));
  }
  if (status) {
    conditions.push(eq(docComments.status, status));
  } else {
    // 默认不显示已删除的
    conditions.push(sql`${docComments.status} != 'deleted'`);
  }
  if (userId) {
    conditions.push(eq(docComments.userId, userId));
  }
  if (keyword) {
    conditions.push(sql`${docComments.content} LIKE ${`%${keyword}%`}`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // 获取总数
  const countResult = await dbAll(
    db.select({ count: sql<number>`count(*)` })
      .from(docComments)
      .where(whereClause)
  );
  const total = Number(countResult[0]?.count || 0);

  // 获取分页数据
  const offset = (page - 1) * pageSize;
  const rows = await dbAll(
    db.select({
      id: docComments.id,
      docUid: docComments.docUid,
      parentId: docComments.parentId,
      userId: docComments.userId,
      username: users.username,
      content: docComments.content,
      selectionStart: docComments.selectionStart,
      selectionEnd: docComments.selectionEnd,
      selectionText: docComments.selectionText,
      status: docComments.status,
      createdAt: docComments.createdAt,
      updatedAt: docComments.updatedAt,
    })
      .from(docComments)
      .leftJoin(users, eq(docComments.userId, users.id))
      .where(whereClause)
      .orderBy(desc(docComments.createdAt))
      .limit(pageSize)
      .offset(offset)
  );

  // 获取每个评论的反应统计
  const comments: Comment[] = [];
  for (const row of rows) {
    const reactions = await getCommentReactions(row.id);
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
      status: row.status,
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

// 管理员强制删除评论（包括回复）
export async function deleteCommentAdmin(
  actor: DocumentActor,
  commentId: number
): Promise<boolean> {
  // 权限检查（仅管理员和超级管理员）
  if (!actor.isSuperAdmin && actor.role !== "admin") {
    throw new Error("无权删除评论");
  }

  const [existing] = await dbAll(
    db.select()
      .from(docComments)
      .where(eq(docComments.id, commentId))
      .limit(1)
  );

  if (!existing) return false;

  // 软删除该评论
  await dbAll(
    db.update(docComments)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(docComments.id, commentId))
  );

  // 同时软删除所有子回复
  await dbAll(
    db.update(docComments)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(docComments.parentId, commentId))
  );

  // 删除关联的反应
  await dbAll(
    db.delete(docCommentReactions)
      .where(eq(docCommentReactions.commentId, commentId))
  );

  return true;
}

// 管理员批量删除评论
export async function deleteCommentsBatch(
  actor: DocumentActor,
  commentIds: number[]
): Promise<{ deleted: number }> {
  // 权限检查
  if (!actor.isSuperAdmin && actor.role !== "admin") {
    throw new Error("无权删除评论");
  }

  if (commentIds.length === 0) return { deleted: 0 };

  // 软删除评论
  const result = await dbAll(
    db.update(docComments)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(sql`${docComments.id} IN (${sql.join(commentIds.map(id => sql`${id}`), sql`, `)})`)
  );

  // 删除关联的反应
  await dbAll(
    db.delete(docCommentReactions)
      .where(sql`${docCommentReactions.commentId} IN (${sql.join(commentIds.map(id => sql`${id}`), sql`, `)})`)
  );

  return { deleted: commentIds.length };
}

// 添加/更新反应
export async function toggleReaction(
  actor: DocumentActor,
  commentId: number,
  reaction: "like" | "dislike"
): Promise<Reaction[]> {
  // 检查评论是否存在
  const [comment] = await dbAll(
    db.select()
      .from(docComments)
      .where(eq(docComments.id, commentId))
      .limit(1)
  );

  if (!comment) {
    throw new Error("评论不存在");
  }

  // 检查是否已有反应
  const [existing] = await dbAll(
    db.select()
      .from(docCommentReactions)
      .where(and(
        eq(docCommentReactions.commentId, commentId),
        eq(docCommentReactions.userId, actor.id)
      ))
      .limit(1)
  );

  if (existing) {
    if (existing.reaction === reaction) {
      // 相同反应，取消
      await dbAll(
        db.delete(docCommentReactions)
          .where(eq(docCommentReactions.id, existing.id))
      );
    } else {
      // 不同反应，更新
      await dbAll(
        db.update(docCommentReactions)
          .set({ reaction, createdAt: new Date() })
          .where(eq(docCommentReactions.id, existing.id))
      );
    }
  } else {
    // 新增反应
    await dbAll(
      db.insert(docCommentReactions)
        .values({
          commentId,
          userId: actor.id,
          reaction,
          createdAt: new Date(),
        })
    );
  }

  return getCommentReactions(commentId, actor.id);
}
