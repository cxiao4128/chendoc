/**
 * features/dashboard/public-api.ts
 *
 * 仪表盘域统一导出入口
 *
 * 职责：
 * - 统一导出 dashboard feature 的所有公共接口
 * - 禁止外部直接 import features/dashboard 内部文件
 */

export { dashboardService } from "./services/dashboard.service";
