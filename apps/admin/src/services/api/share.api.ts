/**
 * services/api/share.api.ts
 *
 * 分享 API 层 - 直接调用 HTTP 层
 *
 * 职责：封装分享相关的 HTTP 请求
 */

import { request } from "@/api/request";

export interface ShareItem {
  id: number;
  shareCode: number;
  customSlug?: string | null;
  isEnabled: boolean;
  reviewStatus?: "pending" | "approved" | "rejected";
  reviewNote?: string | null;
  requestedBy?: number | null;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  hasPassword?: boolean;
  viewCount: number;
  expireAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SharePatch {
  isEnabled?: boolean;
  password?: string | null;
  expireAt?: string | null;
  customSlug?: string | null;
  shareCode?: number | null;
}

export interface ShareReviewItem extends ShareItem {
  docUid: string;
  docTitle: string;
  ownerId?: number | null;
  ownerName?: string | null;
}

// ============= 分享 CRUD =============

export function createShareApi(docUid: string, body: SharePatch = {}) {
  return request<{ share: ShareItem }>(`/api/docs/${docUid}/share`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getShareByDocApi(docUid: string) {
  return request<{ share: ShareItem | null }>(`/api/shares/doc/${docUid}`);
}

export function updateShareApi(id: number, body: SharePatch) {
  return request<{ ok: true }>(`/api/shares/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteShareApi(id: number) {
  return request<{ ok: true }>(`/api/shares/${id}`, { method: "DELETE" });
}

// ============= 分享审核 =============

export function listShareReviewsApi() {
  return request<{ shares: ShareReviewItem[] }>("/api/admin/share-reviews");
}

export function reviewShareApi(id: number, body: { action: "approve" | "reject"; note?: string | null }) {
  return request<{ ok: true }>(`/api/admin/share-reviews/${id}/review`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ============= 导出 API 对象 =============

export const shareApi = {
  create: createShareApi,
  byDocument: getShareByDocApi,
  update: updateShareApi,
  delete: deleteShareApi,
  listReviews: listShareReviewsApi,
  review: reviewShareApi,
};
