import { ensureDangerVerified } from "./security";
import { request } from "./request";
import type { DocSummary, PageInfo, TrashStats } from "./docs.types";

export function listTrashDocsApi(options: { page?: number; pageSize?: number; signal?: AbortSignal } = {}) {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("pageSize", String(options.pageSize));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<{ docs: DocSummary[]; pagination?: PageInfo }>(`/api/docs/trash${query}`, { signal: options.signal });
}

export function getTrashStatsApi() {
  return request<TrashStats>("/api/docs/trash/stats");
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
