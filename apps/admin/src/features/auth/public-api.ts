/**
 * features/auth/public-api.ts
 *
 * 认证域统一导出入口
 *
 * 职责：
 * - 统一导出 auth feature 的所有公共接口
 * - 禁止外部直接 import features/auth 内部文件
 */

export { authService } from "./services/auth.service";
export type { AuthUser } from "./types";
