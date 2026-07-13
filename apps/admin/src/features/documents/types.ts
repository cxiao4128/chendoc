/**
 * features/documents/types.ts - 文档模块类型定义
 *
 * 重构说明：
 * - 统一文档模块的本地类型定义
 * - 从旧 api/docs.ts 类型中分离出独立的文档域类型
 */

// Re-export 旧 API 类型（保持向后兼容）
export type {
  DocDetail as DocumentDetail,
  DocSummary as DocumentSummary,
  DocUpdateInput as DocumentUpdateInput,
  PageInfo,
  SearchOptions
} from "../../api/docs";

// ============= 文档预览 =============
export type DocPreview = {
  title: string;
  summary?: string | null;
  excerpt?: string | null;
  snippet?: string | null;
  contentText?: string | null;
  contentHtml?: string | null;
};

// ============= 文档筛选 =============
export type DocViewFilter = "all" | "published" | "draft" | "review" | "shared" | "unshared" | "kanban";
export type SortMode = "updatedDesc" | "createdDesc" | "titleAsc";
export type UpdatedFilter = "all" | "day" | "week" | "month";

// ============= 列表状态 =============
export interface DocumentListState {
  viewFilter: DocViewFilter;
  sortMode: SortMode;
  updatedFilter: UpdatedFilter;
  spaceFilter: string;
  tagFilter: string;
  searchKeyword: string;
  viewMode: "list" | "kanban";
  kanbanGroupBy: "status" | "tag";
  compactMode: boolean;
  bulkMode: boolean;
  selectedDocUids: Set<string>;
}

// ============= 统计 =============
export interface DocumentStats {
  total: number;
  published: number;
  shared: number;
  review: number;
  draft: number;
  unshared: number;
  availableTags: string[];
}

// ============= 分享状态文本 =============
export interface ShareStatusInfo {
  key: string;
  text: string;
  isPublished: boolean;
  hasShareCode: boolean;
  isPublic: boolean;
  isPending: boolean;
  isRejected: boolean;
  isClosed: boolean;
}

// ============= 存储概览 =============
export interface StorageOverview {
  totalBytes: number;
  fileCount: number;
}

// ============= 快捷操作 =============
export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  handler: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
}

// ============= 看板 =============
export interface KanbanColumn {
  id: string;
  label: string;
  docs: DocSummaryForKanban[];
}

export interface DocSummaryForKanban {
  docUid: string;
  title: string;
  status: string;
  tags?: string[] | string | null;
  pinned?: boolean;
  updatedAt: string;
}

// ============= 批量操作 =============
export interface BulkDeleteConfirm {
  open: boolean;
  count: number;
  deleting: boolean;
}

// ============= 活动日志 =============
export interface ActivityLog {
  id: number;
  action: string;
  targetId: string;
  targetType: string;
  createdAt: string;
}
