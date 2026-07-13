/**
 * services/api/settings.api.ts
 *
 * 设置 API 层 - 统一导出入口
 *
 * 职责：封装设置相关的 HTTP 请求
 * 禁止：写业务逻辑、状态管理
 */

// ============= 类型导出（从子模块） =============

export type {
  R2ConfigView,
  SiteConfigView,
  OperationLogView,
  ManagedUserView,
  ManagedUserDocView,
  SystemAction,
  SystemStatusView,
  SystemActionResult,
  SystemConfigExportView
} from "./settings.types";

// ============= API 函数导出 =============

export {
  // 站点配置
  getPublicSiteConfigApi,
  getSiteConfigApi,
  saveSiteConfigApi,
  // 存储配置
  getR2ConfigApi,
  saveR2ConfigApi,
  testR2Api,
  // 操作日志
  listOperationLogsApi,
  // 系统状态
  getSystemStatusApi,
  runSystemActionApi,
  exportSystemConfigApi,
  // 用户管理
  listManagedUsersApi,
  getManagedUserApi,
  promoteManagedUserApi,
  disableManagedUserApi,
  enableManagedUserApi,
  deleteManagedUserApi,
  getManagedUserPasswordApi,
  resetManagedUserPasswordApi,
  // 统一 API 对象
  settingsApi,
  // 危险操作 API
  getDangerDocApi,
  dangerDeleteDocApi,
  type DangerDocView
} from "./settings.api_core";
