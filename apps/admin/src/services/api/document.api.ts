/**
 * features/documents/services/api/document.api.ts
 *
 * 文档 API 层 - 直接调用 HTTP 层，不再依赖旧 api/*
 *
 * 职责：封装文档相关的 HTTP 请求
 * 禁止：写业务逻辑、状态管理
 */

import { request } from "@/api/request";
import type { DocDetail, DocSummary, DocUpdateInput, PageInfo } from "@/api/docs.types";

// ============= 文档列表 =============

export function listDocsApi(options: {
  q?: string;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
} = {}) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("pageSize", String(options.pageSize));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<{ docs: DocSummary[]; pagination?: PageInfo }>(`/api/docs${query}`, {
    signal: options.signal,
  });
}

// ============= 文档 CRUD =============

export function createDocApi(title: string) {
  return request<{ doc: DocDetail }>("/api/docs", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function getDocApi(docUid: string, signal?: AbortSignal) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}`, { signal });
}

export function updateDocApi(docUid: string, body: DocUpdateInput) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteDocApi(docUid: string) {
  return request<{ ok: true }>(`/api/docs/${docUid}`, { method: "DELETE" });
}

export function bulkDeleteDocsApi(docUids: string[]) {
  return request<{ ok: true; deletedDocUids: string[] }>("/api/docs/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ docUids }),
  });
}

export function publishDocApi(docUid: string) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}/publish`, { method: "POST" });
}

// ============= 文档搜索 =============

export function searchDocsApi(options: {
  q: string;
  page?: number;
  pageSize?: number;
  status?: "draft" | "published" | "archived";
  tags?: string;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({ q: options.q });
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("pageSize", String(options.pageSize));
  if (options.status) params.set("status", options.status);
  if (options.tags) params.set("tags", options.tags);
  return request<{ docs: DocSummary[]; pagination?: PageInfo }>(`/api/docs/search?${params}`, {
    signal: options.signal,
  });
}

export function searchDocsQuickApi(q: string, signal?: AbortSignal) {
  return request<{ docs: DocSummary[] }>(`/api/docs/search/quick?q=${encodeURIComponent(q)}`, {
    signal,
  });
}

// ============= 导出 API 对象 =============

export const documentApi = {
  list: listDocsApi,
  search: searchDocsApi,
  quickSearch: searchDocsQuickApi,
  detail: getDocApi,
  create: createDocApi,
  update: updateDocApi,
  delete: deleteDocApi,
  bulkDelete: bulkDeleteDocsApi,
  publish: publishDocApi,
};
