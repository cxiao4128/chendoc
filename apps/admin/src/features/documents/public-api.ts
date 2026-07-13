/**
 * features/documents/public-api.ts
 *
 * 文档域统一导出入口
 *
 * 职责：
 * - 统一导出 documents feature 的所有公共接口
 * - 禁止外部直接 import features/documents 内部文件
 */

// ============= 细粒度 Hooks =============

// 列表状态
export { useDocListState } from "./hooks/useDocListState";

// 筛选逻辑
export { useDocFilters } from "./hooks/useDocFilters";
export type { DocFilterOptions } from "./hooks/useDocFilters";

// 预览
export { useDocPreview } from "./hooks/useDocPreview";
export type { PreviewPart } from "./hooks/useDocPreview";

// 操作
export { useDocActions } from "./hooks/useDocActions";

// 批量选择
export { useDocBatch } from "./hooks/useDocBatch";

// 排序
export { useDocSort } from "./hooks/useDocSort";

// ============= 原有 Hooks（逐步迁移）============

// 兼容旧接口
export { useDocumentList } from "./hooks/useDocumentList";
export { useDocumentActions } from "./hooks/useDocumentActions";
export { useDocumentBulkActions } from "./hooks/useDocumentBulkActions";
export { useDocumentFileActions } from "./hooks/useDocumentFileActions";
export { useDocumentFilters } from "./hooks/useDocumentFilters";
export { useDocumentStats } from "./hooks/useDocumentStats";
export { useDocListPage } from "./hooks/useDocListPage";

// ============= Types =============

export type {
  DocViewFilter,
  SortMode,
  UpdatedFilter,
  DocumentDetail,
  DocumentSummary,
  DocumentUpdateInput,
  PageInfo,
  SearchOptions,
  DocPreview,
  DocumentListState,
  DocumentStats,
  ShareStatusInfo,
  StorageOverview,
  QuickAction,
  KanbanColumn,
  DocSummaryForKanban,
  BulkDeleteConfirm,
  ActivityLog
} from "./types";
