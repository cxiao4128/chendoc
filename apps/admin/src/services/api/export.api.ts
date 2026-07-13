import { request } from "../http/request";

export type ExportFormat = "markdown" | "html" | "json";

export interface ExportContentResult {
  content: string;
  fileName: string;
  contentType: string;
}

export interface ExportedDocument {
  id?: number;
  docUid: string;
  title: string;
  fileName: string;
  content: string;
}

export interface BatchExportResult {
  documents: ExportedDocument[];
}

export function getExportContentApi(options: {
  docUid?: string;
  docId?: number;
  format?: ExportFormat;
  includeMetadata?: boolean;
}) {
  const params = new URLSearchParams();
  if (options.docUid) params.set("docUid", options.docUid);
  if (options.docId) params.set("docId", String(options.docId));
  params.set("format", options.format || "markdown");
  params.set("metadata", String(options.includeMetadata ?? true));
  return request<ExportContentResult>(`/api/export/content?${params}`);
}

export function batchExportDocsApi(docIds: number[], format: ExportFormat = "markdown", includeMetadata = true) {
  const params = new URLSearchParams({
    format,
    metadata: String(includeMetadata)
  });

  return request<BatchExportResult>(`/api/export/docs?${params}`, {
    method: "POST",
    body: JSON.stringify({ docIds })
  });
}

export const exportApi = {
  content: getExportContentApi,
  batchByIds: batchExportDocsApi
};
