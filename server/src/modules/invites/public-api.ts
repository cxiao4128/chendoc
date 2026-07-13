/**
 * @fileoverview Invites 模块公共接口
 * @description 提供邀请码的生成、验证和使用功能，作为跨模块通信的唯一入口
 *
 * 功能说明：
 * - 邀请码批量生成
 * - 邀请码列表查询（自动刷新过期状态）
 * - 邀请码禁用与删除
 *
 * @module invites
 */

export { inviteCreateSchema, inviteBatchSchema } from "./invites.service.js";

export {
  refreshExpiredInvites,
  listInvites,
  createInvite,
  createInviteBatch,
  disableInvite,
  deleteInvite,
} from "./invites.service.js";
