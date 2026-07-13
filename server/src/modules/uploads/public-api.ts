/**
 * @fileoverview Uploads 模块公共接口
 * @description 提供文件上传策略、预签名 URL 生成和上传完成回调，作为跨模块通信的唯一入口
 *
 * 功能说明：
 * - 上传策略获取（支持的文件类型、大小限制）
 * - 预签名 URL 生成（用于客户端直传 R2）
 * - 上传完成确认回调
 * - 上传记录删除
 *
 * 依赖说明：
 * - 依赖 settings.storage（R2 配置）
 * - 依赖 docs 模块的访问控制检查
 *
 * @module uploads
 */

export type { UploadKind } from "./uploads.service.js";

export {
  getUploadPolicy,
  createPresignedUpload,
  completeUpload,
  deleteUpload,
} from "./uploads.service.js";
