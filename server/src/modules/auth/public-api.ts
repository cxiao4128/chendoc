/**
 * @fileoverview Auth 模块公共 API 导出
 *
 * 模块职责：用户认证、会话管理、TOTP 两步验证、登录风险控制、危险操作二次验证
 *
 * @module auth
 */

// ============================================================================
// 类型导出
// ============================================================================

export type { AuthErrorCode } from "./auth.service.js";
export type { LoginRiskDecision } from "./loginRisk.service.js";
export type { LoginScope } from "./loginRisk.service.js";

// Re-export error class
export { AuthError } from "./auth.service.js";

// ============================================================================
// 认证服务
// ============================================================================

export {
  login,
  register,
  changePassword,
  registerSchema
} from "./auth.service.js";

// ============================================================================
// 会话服务
// ============================================================================

export {
  createAuthSession,
  renewAuthSession,
  verifyAuthSessionToken,
  verifyAuthSessionHeader,
  revokeAuthSession,
  revokeUserAuthSessions,
  cleanupExpiredAuthSessions
} from "./session.service.js";

// ============================================================================
// TOTP 服务
// ============================================================================

export {
  getTotpStatus,
  beginTotpSetup,
  enableTotp,
  disableTotp,
  regenerateRecoveryCodes,
  verifyAdminSecondFactor
} from "./totp.service.js";

// ============================================================================
// 登录风险服务
// ============================================================================

export {
  assessLoginRisk,
  recordLoginFailure,
  recordLoginSuccess,
  clearLoginFailuresForUsername
} from "./loginRisk.service.js";

// ============================================================================
// 危险操作验证服务
// ============================================================================

export {
  dangerVerificationSchema,
  hasFreshDangerVerification,
  verifyDangerOperation,
  requireDangerVerification
} from "./dangerVerification.service.js";
