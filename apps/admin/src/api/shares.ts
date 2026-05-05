import { request } from "./request";

export interface ShareItem {
  id: number;
  docId: number;
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
  docTitle: string;
  ownerId?: number | null;
  ownerName?: string | null;
}

export function createShareApi(docId: number) {
  return request<{ share: ShareItem }>(`/api/docs/${docId}/share`, { method: "POST", body: JSON.stringify({}) });
}

export function getShareByDocApi(docId: number) {
  return request<{ share: ShareItem | null }>(`/api/shares/doc/${docId}`);
}

export function updateShareApi(id: number, body: SharePatch) {
  return request<{ ok: true }>(`/api/shares/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteShareApi(id: number) {
  return request<{ ok: true }>(`/api/shares/${id}`, { method: "DELETE" });
}

export function listShareReviewsApi() {
  return request<{ shares: ShareReviewItem[] }>("/api/admin/share-reviews");
}

export function reviewShareApi(id: number, body: { action: "approve" | "reject"; shareCode?: number | null; customSlug?: string | null; note?: string | null }) {
  return request<{ ok: true }>(`/api/admin/share-reviews/${id}/review`, { method: "POST", body: JSON.stringify(body) });
}
