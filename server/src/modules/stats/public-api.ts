/**
 * @fileoverview Stats 模块公共接口
 * @description 提供文档和表单访问统计的记录和查询功能，作为跨模块通信的唯一入口
 *
 * 功能说明：
 * - 访问记录写入
 * - 访问统计查询（总访问量、独立访客、设备分布、趋势）
 * - 最近访问记录查询
 * - 过期数据清理
 *
 * @module stats
 */

export type {
  AccessLog,
  AccessStats,
} from "./stats.service.js";

export {
  recordAccess,
  getAccessStats,
  getRecentAccess,
  cleanupOldAccessLogs,
} from "./stats.service.js";
