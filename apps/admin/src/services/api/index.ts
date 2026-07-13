/**
 * services/api/index.ts
 *
 * API 层统一导出入口
 *
 * 职责：统一导出所有业务 API 函数
 * 来源：直接调用 api/request.ts，不再依赖旧 api/*.ts
 *
 * 迁移状态：
 * - ✅ document.api.ts - 已重写
 * - ✅ share.api.ts - 已重写
 * - ✅ settings.api.ts - 已重写
 * - ⏳ 其余文件 - 待迁移
 */

// ============= HTTP 层（透传） =============
export { ApiError, clearToken, getApiErrorMessage, getToken, request, setToken } from "@/api/request";

// ============= 文档 API =============
export { documentApi } from "./document.api";
export { listDocsApi, createDocApi, getDocApi, updateDocApi, deleteDocApi, bulkDeleteDocsApi, publishDocApi } from "./document.api";
export { searchDocsApi, searchDocsQuickApi } from "./document.api";
export type { DocDetail, DocSummary, DocUpdateInput, PageInfo, SearchOptions } from "@/api/docs.types";
export type { DocVersion, DocVersionPreview, DocSchedule, SetScheduleInput, TrashStats } from "@/api/docs.types";

// ============= 分享 API =============
export { shareApi } from "./share.api";
export { createShareApi, getShareByDocApi, updateShareApi, deleteShareApi, listShareReviewsApi, reviewShareApi } from "./share.api";
export type { ShareItem, SharePatch, ShareReviewItem } from "./share.api";

// ============= 设置 API =============
export { settingsApi } from "./settings.api";
export { getPublicSiteConfigApi, getSiteConfigApi, saveSiteConfigApi } from "./settings.api";
export { getR2ConfigApi, saveR2ConfigApi, testR2Api } from "./settings.api";
export { listOperationLogsApi } from "./settings.api";
export { getSystemStatusApi, runSystemActionApi, exportSystemConfigApi } from "./settings.api";
export { listManagedUsersApi, getManagedUserApi, promoteManagedUserApi, disableManagedUserApi, enableManagedUserApi, deleteManagedUserApi, getManagedUserPasswordApi, resetManagedUserPasswordApi } from "./settings.api";
export type { R2ConfigView, SiteConfigView, OperationLogView, ManagedUserView, SystemStatusView, SystemAction } from "./settings.api";

// ============= 待迁移 API（临时从旧 api/ 导出） =============
// TODO: 这些文件需要逐步迁移到直接调用 api/request.ts

// 编辑器 API
export {
  getDocScheduleApi,
  setDocScheduleApi,
  deleteDocScheduleApi,
  listDocVersionsApi,
  restoreDocVersionApi,
  getDocVersionPreviewApi,
  restoreDocVersionAsCopyApi
} from "@/api/docs.versions";

// 回收站 API
export {
  listTrashDocsApi,
  getTrashStatsApi,
  restoreDocApi,
  bulkRestoreTrashDocsApi,
  hardDeleteDocApi,
  bulkHardDeleteTrashDocsApi
} from "@/api/docs.trash";

// 搜索 API
export {
  searchDocsApi as searchDocsFullApi,
  searchDocsQuickApi as searchDocsQuickFullApi,
  getSearchSuggestionsApi,
  getSearchHistoryApi,
  clearSearchHistoryApi,
  deleteSearchHistoryItemApi
} from "@/api/docs.search";

// 导出 API
export { batchExportDocsApi } from "@/api/docs.export";

// 评论 API
export {
  listDocComments,
  createDocComment,
  updateDocComment,
  deleteDocComment,
  toggleCommentReaction as toggleReaction
} from "@/api/comments";
export type { Comment, Reaction, CreateCommentInput, UpdateCommentInput } from "@/api/comments";

// 表单 API
export {
  listFormsApi,
  getFormApi,
  createFormApi,
  updateFormApi,
  deleteFormApi,
  publishFormApi,
  listSubmissionsApi as listFormSubmissionsApi,
  exportFormApi as exportFormSubmissionsApi,
  getIpStatsApi as getFormStatsApi
} from "@/api/forms";
export type { FormItem, FormField, FieldType, SubmissionItem } from "@/api/forms";

// 上传 API
export {
  getUploadPolicyApi,
  presignUploadApi,
  completeUploadApi
} from "@/api/uploads";
export type { PresignInput, UploadPolicy, UploadPolicyItem } from "@/api/uploads";

// 认证 API
export { authApi } from "./auth.api";
export { loginApi, registerApi, fetchProfileApi, logoutApi, restoreSessionApi } from "./auth.api";
export type { UserProfile } from "@/api/auth";

// 用户 API
export { userApi } from "./user.api";

// 仪表盘 API
export { dashboardApi } from "./dashboard.api";

// ============= 统计 API =============
export { getAccessStats, getRecentAccess, trackAccess, formatDevice, formatNumber, calculatePercent } from "@/api/stats";
export type { AccessLog, DeviceBreakdown, DailyView, AccessStats } from "@/api/stats";

// ============= 标签 API =============
export { getTagTree, listTags, getTagStats, getTag, createTag, updateTag, renameTag, deleteTag, mergeTags, addTagsToDocs, removeTagsFromDocs, getTagColors, isValidColor, TAG_COLORS, TAG_ICONS } from "@/api/tags";
export type { Tag, TagWithChildren, CreateTagInput, UpdateTagInput, TagStats, TagColor } from "@/api/tags";

// ============= 模板 API =============
export {
  listTemplates,
  listBuiltInTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  MAX_TEMPLATES_PER_USER
} from "./template.api";
export type { Template, CreateTemplateInput, UpdateTemplateInput } from "./template.api";
