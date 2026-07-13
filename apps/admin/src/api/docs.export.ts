import { request } from "./request";
import type { BatchExportResult, ExportFormat } from "./docs.types";

export async function batchExportDocsApi(
  docIds: number[],
  format: ExportFormat = "markdown",
  includeMetadata = true
): Promise<BatchExportResult> {
  const params = new URLSearchParams({
    format,
    metadata: String(includeMetadata)
  });

  return request<BatchExportResult>(`/api/export/docs?${params}`, {
    method: "POST",
    body: JSON.stringify({ docIds })
  });
}
