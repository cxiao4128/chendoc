/**
 * features/settings/public-api.ts
 *
 * 设置域统一导出入口
 *
 * 职责：
 * - 统一导出 settings feature 的所有公共接口
 * - 禁止外部直接 import features/settings 内部文件
 */

// ============= 子域聚合导出 =============

export { siteService } from "./site/public-api";
export { storageService } from "./storage/public-api";
export { usersService } from "./users/public-api";
export { systemService } from "./system/public-api";
export { logsService } from "./logs/public-api";
export { securityService } from "./security/public-api";

// ============= 兼容导出（旧 hooks 保留）============

export { useSystemSettings } from "./hooks/useSystemSettings";
export { useVersionCheck } from "./hooks/useVersionCheck";
export { useManagedUsers } from "./hooks/useManagedUsers";
export { createManagedUsersState } from "./hooks/managedUsersState";
export { roleText, statusText, userInitials, type UserDetailTab, type AuthContext } from "./hooks/managedUsersShared";
export { useOperationLogs } from "./hooks/useOperationLogs";
export { useSystemMaintenance } from "./hooks/useSystemMaintenance";

// ============= 类型 =============

export type {
  OperationLogView,
  R2ConfigView,
  SiteConfigView,
  SystemAction,
  SystemActionResult,
  SystemConfigExportView,
  SystemStatusView
} from "./types";
