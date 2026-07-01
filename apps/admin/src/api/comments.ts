// ChenDoc v3.0.0 - 文档评论 API 客户端

import { request } from "./request.js";

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
  createdAt: string;
  updatedAt: string;
}

export interface Reaction {
  reaction: string;
  count: number;
  userReacted?: boolean;
}

export interface CreateCommentInput {
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

// 获取文档评论列表
export async function listDocComments(docUid: string): Promise<Comment[]> {
  const res = await request<{ comments: Comment[] }>(`/api/docs/${encodeURIComponent(docUid)}/comments`);
  return res.comments || [];
}

// 创建评论
export async function createDocComment(docUid: string, input: CreateCommentInput): Promise<Comment> {
  const res = await request<{ comment: Comment }>(`/api/docs/${encodeURIComponent(docUid)}/comments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.comment;
}

// 更新评论
export async function updateDocComment(commentId: number, input: UpdateCommentInput): Promise<Comment | null> {
  const res = await request<{ comment: Comment | null; error?: string }>(`/api/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (res.error) return null;
  return res.comment || null;
}

// 删除评论
export async function deleteDocComment(commentId: number): Promise<boolean> {
  const res = await request<{ success: boolean }>(`/api/comments/${commentId}`, {
    method: "DELETE",
  });
  return res.success;
}

// 添加/切换反应
export async function toggleCommentReaction(commentId: number, reaction: "like" | "dislike"): Promise<Reaction[]> {
  const res = await request<{ reactions: Reaction[] }>(`/api/comments/${commentId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ reaction }),
  });
  return res.reactions || [];
}
