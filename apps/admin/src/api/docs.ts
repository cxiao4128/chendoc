import { request } from "./request";

export interface DocSummary {
  docUid: string;
  spaceId: number | null;
  parentId: number | null;
  title: string;
  summary?: string | null;
  tags?: string[] | string | null;
  status: "draft" | "published" | "archived";
  pinned?: boolean;
  sort: number;
  createdBy?: number | null;
  updatedBy?: number | null;
  ownerId?: number | null;
  ownerRole?: "user" | "doc_admin" | "super_admin";
  scope?: "user" | "admin" | "system";
  isSuperAdminDoc?: boolean;
  visibility?: "private" | "shared" | "public";
  tenantKey?: string;
  ownerUsername?: string | null;
  updatedAt: string;
  createdAt: string;
  deletedAt?: string | null;
  shareCode?: number | null;
  customSlug?: string | null;
  shareEnabled?: boolean | null;
  shareReviewStatus?: "pending" | "approved" | "rejected" | null;
}

export interface DocDetail extends DocSummary {
  contentJson: string;
  contentHtml: string;
  coverUrl?: string | null;
  summary?: string | null;
  tags?: string[] | string | null;
  share?: Record<string, unknown> | null;
}

export type DocUpdateInput = Partial<Pick<DocDetail, "title" | "contentJson" | "contentHtml" | "coverUrl" | "summary" | "tags" | "pinned" | "status" | "sort">>;

export interface DocVersion {
  id: number;
  title: string;
  wordCount: number;
  authorName: string;
  diffSummary: string;
  createdBy?: number | null;
  createdAt: string;
}

export interface DocVersionPreview {
  id: number;
  title: string;
  contentText: string;
  wordCount: number;
  createdBy?: number | null;
  createdAt: string;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function listDocsApi(options: { q?: string; page?: number; pageSize?: number; signal?: AbortSignal } = {}) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("pageSize", String(options.pageSize));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<{ docs: DocSummary[]; pagination?: PageInfo }>(`/api/docs${query}`, { signal: options.signal });
}

export function searchDocsApi(q: string, signal?: AbortSignal) {
  return request<{ docs: DocSummary[] }>(`/api/docs/search?q=${encodeURIComponent(q)}`, { signal });
}

export function listTrashDocsApi(options: { page?: number; pageSize?: number; signal?: AbortSignal } = {}) {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("pageSize", String(options.pageSize));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<{ docs: DocSummary[]; pagination?: PageInfo }>(`/api/docs/trash${query}`, { signal: options.signal });
}

export interface TrashStats {
  trashCount: number;
  storageUsedBytes: number;
  storageTotalBytes: number;
  oldestDeletedAt: string | null;
  oldestDeletedDocUid: string | null;
  oldestDeletedTitle: string | null;
}

export function getTrashStatsApi() {
  return request<TrashStats>("/api/admin/docs/trash/stats");
}

export function createDocApi(title: string) {
  return request<{ doc: DocDetail }>("/api/docs", { method: "POST", body: JSON.stringify({ title }) });
}

export function getDocApi(docUid: string, signal?: AbortSignal) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}`, { signal });
}

export function updateDocApi(docUid: string, body: DocUpdateInput) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteDocApi(docUid: string) {
  return request<{ ok: true }>(`/api/docs/${docUid}`, { method: "DELETE" });
}

export function bulkDeleteDocsApi(docUids: string[]) {
  return request<{ ok: true; deletedDocUids: string[] }>("/api/docs/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ docUids })
  });
}

export function restoreDocApi(docUid: string) {
  return request<{ success: true; restored: number; restoredDocUids: string[] }>("/api/docs/trash/batch-restore", {
    method: "POST",
    body: JSON.stringify({ docUids: [docUid] })
  });
}

export function bulkRestoreTrashDocsApi(docUids: string[]) {
  return request<{ success: true; restored: number; restoredDocUids: string[] }>("/api/docs/trash/batch-restore", {
    method: "POST",
    body: JSON.stringify({ docUids })
  });
}

export function hardDeleteDocApi(docUid: string) {
  return request<{ success: true; deleted: number; deletedDocUids: string[] }>("/api/docs/trash/batch-delete", {
    method: "POST",
    body: JSON.stringify({ docUids: [docUid] })
  });
}

export function bulkHardDeleteTrashDocsApi(docUids: string[]) {
  return request<{ success: true; deleted: number; deletedDocUids: string[] }>("/api/docs/trash/batch-delete", {
    method: "POST",
    body: JSON.stringify({ docUids })
  });
}

export function publishDocApi(docUid: string) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}/publish`, { method: "POST" });
}

export function listDocVersionsApi(docUid: string) {
  return request<{ versions: DocVersion[] }>(`/api/docs/${docUid}/versions`);
}

export function restoreDocVersionApi(docUid: string, versionId: number) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}/versions/${versionId}/restore`, { method: "POST" });
}

export function getDocVersionPreviewApi(docUid: string, versionId: number) {
  return request<{ version: DocVersionPreview }>(`/api/docs/${docUid}/versions/${versionId}`);
}

export function restoreDocVersionAsCopyApi(docUid: string, versionId: number) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}/versions/${versionId}/restore-copy`, { method: "POST" });
}
