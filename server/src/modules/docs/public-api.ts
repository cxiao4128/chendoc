/**
 * @fileoverview Docs 模块公共 API 导出
 *
 * 模块职责：文档 CRUD、版本管理、访问控制、搜索、回收站、定时发布
 *
 * 依赖说明：
 * - shares 模块：文档更新后清除分享缓存（invalidateDecryptedDocCache）
 * - public 模块：分享页缓存失效（invalidateShareHtmlCache）
 *
 * @module docs
 */

// ============================================================================
// 类型导出
// ============================================================================

export type { DocumentAction, DocumentActor, DocumentAccessRecord } from "./documentAccess.js";

// ============================================================================
// 访问控制（核心，被其他模块依赖）
// ============================================================================

export { canAccessDocument } from "./documentAccess.js";

// ============================================================================
// 文档 CRUD 服务
// ============================================================================

export {
  listDocs,
  listDocsPage,
  getDoc,
  getDocByUid,
  createDoc,
  updateDoc,
  updateDocByUid,
  softDeleteDoc,
  softDeleteDocByUid,
  bulkSoftDeleteDocs,
  bulkSoftDeleteDocsByUid,
  restoreDoc,
  restoreDocByUid,
  bulkRestoreDocs,
  bulkRestoreDocsByUid,
  hardDeleteDoc,
  hardDeleteDocByUid,
  bulkHardDeleteTrashDocs,
  bulkHardDeleteTrashDocsByUid,
  publishDoc,
  publishDocByUid,
  safeDocPayload,
  safeDocListPayload,
} from "./docs.service.js";

// ============================================================================
// 文档版本服务
// ============================================================================

export {
  listDocVersions,
  listDocVersionsByUid,
  getDocVersionPreviewByUid,
  restoreDocVersion,
  restoreDocVersionAsCopyByUid,
  restoreDocVersionByUid,
} from "./docs.service.js";

// ============================================================================
// 回收站服务
// ============================================================================

export {
  listTrashDocs,
  listTrashDocsPage,
  getTrashStats,
  purgeExpiredTrashDocs,
} from "./docs.service.js";

// ============================================================================
// 定时发布服务
// ============================================================================

export type { ScheduleInfo } from "./docs.service.js";

export {
  setDocumentSchedule,
  getDocumentSchedule,
  processScheduledDocs,
  processExpiredDrafts,
} from "./docs.service.js";

// ============================================================================
// 搜索服务
// ============================================================================

export type {
  SearchResult,
  FullTextSearchOptions,
  SearchSuggestion,
  SearchHistoryItem,
  HighlightedPart,
} from "./docs.search.service.js";

export {
  searchDocsFullText,
  searchDocsQuick,
  searchWithSuggestions,
  highlightText,
  parseKeywords,
  getSearchHistory,
  deleteSearchHistoryItem,
  clearSearchHistory,
  getSearchSuggestions,
} from "./docs.search.service.js";
