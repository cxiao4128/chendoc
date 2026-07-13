import { completeUploadApi, getUploadPolicyApi, presignUploadApi } from "../../api/uploads";
import { uploadFile } from "../../features/upload/services/upload.service";

export type { PresignInput, UploadPolicy, UploadPolicyItem } from "../../api/uploads";

export const uploadApi = {
  policy: getUploadPolicyApi,
  presign: presignUploadApi,
  complete: completeUploadApi,
  uploadFile
};
