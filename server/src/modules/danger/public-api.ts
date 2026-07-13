/**
 * @fileoverview Danger 模块公共接口
 * @description 提供危险操作（如强制删除文档）的服务端功能，作为跨模块通信的唯一入口
 *
 * 功能说明：
 * - 通过 docUid 查询文档信息
 * - 危险操作的数据删除（软删除 + 操作日志）
 *
 * 安全说明：
 * - 此模块涉及危险操作，必须配合 auth.requireDangerVerification 中间件使用
 * - 必须经过超级管理员认证
 * - 所有操作都会记录到审计日志
 *
 * 依赖说明：
 * - 依赖 auth.requireDangerVerification（危险操作二次验证）
 * - 依赖 docs 模块（文档数据访问）
 *
 * @module danger
 */

export {
  findDocByUid,
  dangerDeleteDoc,
} from "./danger.service.js";
