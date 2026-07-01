// ChenDoc v3.0.0 - 评论管理 API

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

// 获取所有评论（后台管理）
export async function listAllComments(options: ListCommentsOptions = {}): Promise<ListCommentsResult> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("pageSize", String(options.pageSize));
  if (options.docUid) params.set("docUid", options.docUid);
  if (options.status) params.set("status", options.status);
  if (options.userId) params.set("userId", String(options.userId));
  if (options.keyword) params.set("keyword", options.keyword);

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await request<ListCommentsResult>(`/api/admin/comments${query}`, {
    method: "GET",
  });
  return res as ListCommentsResult;
}

// 管理员删除单个评论
export async function deleteCommentAdmin(commentId: number): Promise<{ success: boolean }> {
  const res = await request<{ success: boolean }>(`/api/admin/comments/${commentId}`, {
    method: "DELETE",
  });
  return res as { success: boolean };
}

// 管理员批量删除评论
export async function deleteCommentsBatch(commentIds: number[]): Promise<{ deleted: number }> {
    const res = await request<{ deleted: number }>("/api/admin/comments/batch-delete", {
    method: "POST",
    body: JSON.stringify({ commentIds }),
  });
  return res as { deleted: number };
}