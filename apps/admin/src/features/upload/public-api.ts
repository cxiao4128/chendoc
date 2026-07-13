/**
 * features/upload/public-api.ts
 *
 * 上传域统一导出入口
 */

export { uploadFile } from "./services/upload.service";

export type { PresignInput, UploadPolicy, UploadPolicyItem } from "./types";
