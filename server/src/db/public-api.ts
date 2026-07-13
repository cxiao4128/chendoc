/**
 * @fileoverview DB 层公共接口
 * @description 只导出 schema 表定义，不包含任何业务逻辑或查询封装
 *
 * 允许访问：业务模块的 repo 层（只读表定义）
 * 禁止访问：routes、handlers、services、policies
 */

export type { User, NewUser } from "./schema.js";
export {
  users,
  invites,
  captchas,
  cryptoKeys,
  authSessions,
  spaces,
  docs,
  shares,
  uploads,
  docVersions,
  settings,
  operationLogs,
  loginFailures,
  dangerVerifications,
  auditLogs,
  logs,
  uniqueShareCode,
  forms,
  formSubmissions,
  tags,
  tagHierarchy,
  docComments,
  docCommentReactions,
  templates,
  accessLogs,
  jwtKeys,
  totpFailures,
  searchHistory,
} from "./schema.js";

/**
 * 事务封装 — service 层如果需要跨 repo 操作，可导入此函数
 * 禁止在 service 层导入 db / dbAll / dbGet / dbRun
 */
export { dbTransaction } from "./client.js";
