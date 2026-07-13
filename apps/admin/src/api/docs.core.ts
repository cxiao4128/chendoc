import { request } from "./request";
import type { DocDetail, DocSummary, DocUpdateInput, PageInfo } from "./docs.types";

export function listDocsApi(options: { q?: string; page?: number; pageSize?: number; signal?: AbortSignal } = {}) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("pageSize", String(options.pageSize));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<{ docs: DocSummary[]; pagination?: PageInfo }>(`/api/docs${query}`, { signal: options.signal });
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

export function publishDocApi(docUid: string) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}/publish`, { method: "POST" });
}
