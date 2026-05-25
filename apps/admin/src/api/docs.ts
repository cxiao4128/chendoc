import { request } from "./request";

export interface DocSummary {
  id: number;
  spaceId: number | null;
  parentId: number | null;
  title: string;
  summary?: string | null;
  status: "draft" | "published" | "archived";
  pinned?: boolean;
  sort: number;
  createdBy?: number | null;
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

export interface DocVersion {
  id: number;
  docId: number;
  title: string;
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

export function createDocApi(title: string) {
  return request<{ doc: DocDetail }>("/api/docs", { method: "POST", body: JSON.stringify({ title }) });
}

export function getDocApi(id: number, signal?: AbortSignal) {
  return request<{ doc: DocDetail }>(`/api/docs/${id}`, { signal });
}

export function updateDocApi(id: number, body: Partial<DocDetail>) {
  return request<{ doc: DocDetail }>(`/api/docs/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteDocApi(id: number) {
  return request<{ ok: true }>(`/api/docs/${id}`, { method: "DELETE" });
}

export function bulkDeleteDocsApi(ids: number[]) {
  return request<{ ok: true; deletedIds: number[] }>("/api/docs/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
}

export function restoreDocApi(id: number) {
  return request<{ success: true; restored: number; restoredIds: number[] }>("/api/docs/trash/batch-restore", {
    method: "POST",
    body: JSON.stringify({ ids: [id] })
  });
}

export function bulkRestoreTrashDocsApi(ids: number[]) {
  return request<{ success: true; restored: number; restoredIds: number[] }>("/api/docs/trash/batch-restore", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
}

export function hardDeleteDocApi(id: number) {
  return request<{ success: true; deleted: number; deletedIds: number[] }>("/api/docs/trash/batch-delete", {
    method: "POST",
    body: JSON.stringify({ ids: [id] })
  });
}

export function bulkHardDeleteTrashDocsApi(ids: number[]) {
  return request<{ success: true; deleted: number; deletedIds: number[] }>("/api/docs/trash/batch-delete", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
}

export function publishDocApi(id: number) {
  return request<{ doc: DocDetail }>(`/api/docs/${id}/publish`, { method: "POST" });
}

export function listDocVersionsApi(id: number) {
  return request<{ versions: DocVersion[] }>(`/api/docs/${id}/versions`);
}

export function restoreDocVersionApi(id: number, versionId: number) {
  return request<{ doc: DocDetail }>(`/api/docs/${id}/versions/${versionId}/restore`, { method: "POST" });
}
