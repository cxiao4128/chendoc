// ChenDoc v2.10.0 - 批量导出 Composable
// 提供文档批量导出的响应式状态管理

import { ref } from "vue";
import JSZip from "jszip";
import { exportApi, type ExportFormat } from "../services/api/export.api";

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  fileName?: string;
}

// 批量导出
export function useExport() {
  // 状态
  const exporting = ref(false);
  const progress = ref(0);
  const error = ref("");

  // 导出单个文档（通过服务器获取内容并下载）
  async function exportSingle(docId: number, options: ExportOptions): Promise<void> {
    exporting.value = true;
    error.value = "";
    progress.value = 0;

    try {
      const result = await exportApi.batchByIds([docId], options.format, options.includeMetadata ?? true);
      if (result.documents.length === 0) {
        error.value = "文档不存在或无权访问";
        return;
      }

      const doc = result.documents[0];
      downloadFile(doc.content, doc.fileName, getMimeType(options.format));
    } catch (e: any) {
      error.value = e.message || "导出失败";
    } finally {
      exporting.value = false;
      progress.value = 0;
    }
  }

  // 批量导出（打包为 ZIP）
  async function exportMultiple(docIds: number[], options: ExportOptions): Promise<void> {
    if (docIds.length === 0) {
      error.value = "没有要导出的文档";
      return;
    }

    exporting.value = true;
    progress.value = 0;
    error.value = "";

    try {
      const result = await exportApi.batchByIds(docIds, options.format, options.includeMetadata ?? true);
      const zip = new JSZip();
      const folderName = options.fileName || "chendoc_export";

      for (let i = 0; i < result.documents.length; i++) {
        const doc = result.documents[i];
        zip.file(`${folderName}/${doc.fileName}`, doc.content);
        progress.value = Math.round(((i + 1) / result.documents.length) * 100);

        // 分批处理，避免阻塞 UI
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // 生成 ZIP 文件
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      downloadBlob(zipBlob, `${folderName}.zip`);
    } catch (e: any) {
      error.value = e.message || "导出失败";
    } finally {
      exporting.value = false;
      progress.value = 0;
    }
  }

  return {
    exporting,
    progress,
    error,
    exportSingle,
    exportMultiple,
  };
}

// 辅助函数
function getMimeType(format: ExportFormat): string {
  const mimeTypes: Record<ExportFormat, string> = {
    markdown: "text/markdown;charset=utf-8",
    html: "text/html;charset=utf-8",
    json: "application/json;charset=utf-8",
  };
  return mimeTypes[format];
}

function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, fileName);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
