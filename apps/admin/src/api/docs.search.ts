import { request } from "./request";
import type { DocSummary, SearchOptions } from "./docs.types";

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

export function searchDocsQuickApi(q: string, signal?: AbortSignal) {
  return request<{ docs: DocSummary[] }>(`/api/docs/search/quick?q=${encodeURIComponent(q)}`, { signal });
}

export function getSearchSuggestionsApi(q: string, limit?: number) {
  const params = new URLSearchParams({ q });
  if (limit) params.set("limit", String(limit));
  return request<{ suggestions: Array<{ keyword: string; count: number }> }>(`/api/docs/search/suggestions?${params}`);
}

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
