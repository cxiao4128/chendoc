import { request } from "./request";
import { ensureDangerVerified } from "./security";

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
  deletedBy?: number | null;
  revision: number;
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
  scheduledAt?: string | null;
  expiresAt?: string | null;
  autoArchive?: boolean;
}

export type DocUpdateInput = Partial<Pick<DocDetail, "title" | "contentJson" | "contentHtml" | "coverUrl" | "summary" | "tags" | "pinned" | "status" | "sort">> & {
  expectedRevision?: number;
};

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

// 搜索选项接口
export interface SearchOptions {
  q: string;
  page?: number;
  pageSize?: number;
  sort?: "relevance" | "updatedAt" | "createdAt" | "viewCount";
  sortOrder?: "asc" | "desc";
  includeHighlights?: boolean;
  // 高级过滤
  status?: "draft" | "published" | "archived";
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export function searchDocsApi(options: SearchOptions, signal?: AbortSignal) {
  const params = new URLSearchParams();
  params.set("q", options.q);
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("pageSize", String(options.pageSize));
  if (options.sort) params.set("sort", options.sort);
  if (options.sortOrder) params.set("sortOrder", options.sortOrder);
  if (options.includeHighlights !== undefined) params.set("includeHighlights", String(options.includeHighlights));
  if (options.status) params.set("status", options.status);
  if (options.tags?.length) params.set("tags", options.tags.join(","));
  if (options.dateFrom) params.set("dateFrom", options.dateFrom);
  if (options.dateTo) params.set("dateTo", options.dateTo);
  return request<{ docs: DocSummary[] }>(`/api/docs/search?${params}`, { signal });
}

// 快速搜索（仅标题摘要）
export function searchDocsQuickApi(q: string, signal?: AbortSignal) {
  return request<{ docs: DocSummary[] }>(`/api/docs/search/quick?q=${encodeURIComponent(q)}`, { signal });
}

// 搜索建议
export function getSearchSuggestionsApi(q: string, limit?: number) {
  const params = new URLSearchParams({ q });
  if (limit) params.set("limit", String(limit));
  return request<{ suggestions: Array<{ keyword: string; count: number }> }>(`/api/docs/search/suggestions?${params}`);
}

// 搜索历史
export function getSearchHistoryApi(page?: number, pageSize?: number) {
  const params = new URLSearchParams();
  if (page) params.set("page", String(page));
  if (pageSize) params.set("pageSize", String(pageSize));
  return request<{ history: unknown[]; page: number; pageSize: number }>(`/api/docs/search/history?${params}`);
}

export function clearSearchHistoryApi() {
  return request<{ ok: boolean }>("/api/docs/search/history", { method: "DELETE" });
}

export function deleteSearchHistoryItemApi(id: number) {
  return request<{ ok: boolean }>(`/api/docs/search/history/${id}`, { method: "DELETE" });
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
  retentionDays: number;
}

export function getTrashStatsApi() {
  return request<TrashStats>("/api/docs/trash/stats");
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

export async function hardDeleteDocApi(docUid: string) {
  await ensureDangerVerified();
  return request<{ success: true; deleted: number; deletedDocUids: string[] }>("/api/docs/trash/batch-delete", {
    method: "POST",
    body: JSON.stringify({ docUids: [docUid] })
  });
}

export async function bulkHardDeleteTrashDocsApi(docUids: string[]) {
  await ensureDangerVerified();
  return request<{ success: true; deleted: number; deletedDocUids: string[] }>("/api/docs/trash/batch-delete", {
    method: "POST",
    body: JSON.stringify({ docUids })
  });
}

export function publishDocApi(docUid: string) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}/publish`, { method: "POST" });
}

// 定时发布
export interface DocSchedule {
  scheduledAt: string | null;
  expiresAt: string | null;
  autoArchive: boolean;
}

export interface SetScheduleInput {
  scheduledAt?: string | null;
  expiresAt?: string | null;
  autoArchive?: boolean;
}

export function getDocScheduleApi(docUid: string) {
  return request<{ schedule: DocSchedule | null }>(`/api/docs/${docUid}/schedule`);
}

export function setDocScheduleApi(docUid: string, input: SetScheduleInput) {
  return request<{ schedule: DocSchedule }>(`/api/docs/${docUid}/schedule`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteDocScheduleApi(docUid: string) {
  return request<{ ok: true }>(`/api/docs/${docUid}/schedule`, { method: "DELETE" });
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

// 导出格式
export type ExportFormat = "markdown" | "html" | "json";

// 导出文档结果
export interface ExportedDoc {
  docUid: string;
  title: string;
  content: string;
  fileName: string;
}

// 批量导出结果
export interface BatchExportResult {
  documents: ExportedDoc[];
}

// 批量导出文档
export async function batchExportDocsApi(
  docUids: string[],
  format: ExportFormat = "markdown",
  includeMetadata = true
): Promise<BatchExportResult> {
  return request<BatchExportResult>("/api/docs/export", {
    method: "POST",
    body: JSON.stringify({ docUids, format, includeMetadata })
  });
}
