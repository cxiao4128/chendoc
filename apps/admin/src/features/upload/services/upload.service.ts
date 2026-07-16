import { completeUploadApi, getUploadPolicyApi, presignUploadApi, type UploadPolicy } from "../../../api/uploads";
import { prepareUpload } from "./upload-preparation";

let policyCache: UploadPolicy | null = null;

async function loadUploadPolicy() {
  if (!policyCache) {
    policyCache = (await getUploadPolicyApi()).policy;
  }
  return policyCache;
}

export async function uploadFile(file: File, docUid: string) {
  const policy = await loadUploadPolicy();
  const prepared = await prepareUpload(file, policy);
  const input = {
    fileName: prepared.file.name,
    mimeType: prepared.mimeType,
    size: prepared.file.size,
    kind: prepared.kind,
    docUid
  };
  let presigned: Awaited<ReturnType<typeof presignUploadApi>>;
  try {
    presigned = await presignUploadApi(input);
  } catch (error) {
    if (error instanceof Error && error.message.includes("R2 配置不完整")) {
      throw new Error("R2 配置不完整，请联系管理员在“R2 对象存储”中完成配置并测试上传", { cause: error });
    }
    throw error;
  }
  let put: Response;
  try {
    put = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": input.mimeType },
      body: prepared.file
    });
  } catch {
    throw new Error("无法直传到 R2，请检查 R2 CORS 设置");
  }
  if (!put.ok) throw new Error("上传到 R2 失败");
  const complete = await completeUploadApi({
    ...input,
    uploadToken: presigned.uploadToken,
    objectKey: presigned.objectKey
  });
  return complete.upload.publicUrl;
}
