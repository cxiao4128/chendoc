/**
 * features/settings/system/public-api.ts
 * 系统状态域统一导出
 */
export { settingsApi as systemService } from "../../../services/api/settings.api";
export type { SystemStatusView, SystemAction, SystemActionResult } from "../../../services/api/settings.api";
