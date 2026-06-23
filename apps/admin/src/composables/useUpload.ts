import { completeUploadApi, getUploadPolicyApi, presignUploadApi, type UploadPolicy } from "../api/uploads";

type UploadKind = "image" | "video" | "file";

let policyCache: UploadPolicy | null = null;

async function loadUploadPolicy() {
  if (!policyCache) {
    policyCache = (await getUploadPolicyApi()).policy;
  }
  return policyCache;
}

function extensionFromName(name: string) {
  return name.match(/\.[A-Za-z0-9]+$/)?.[0].toLowerCase() || "";
}

function extensionFromMime(mimeType: string, kind: UploadKind, policy: UploadPolicy) {
  const normalized = mimeType.toLowerCase();
  for (const [extension, mimeTypes] of Object.entries(policy[kind].mimeByExtension)) {
    if (mimeTypes.includes(normalized)) return extension;
  }
  return kind === "image" ? ".webp" : "";
}

function mimeFromExtension(extension: string, kind: UploadKind, policy: UploadPolicy) {
  return policy[kind].mimeByExtension[extension]?.[0];
}

function maxDimension(width: number, height: number, limit = 2400) {
  const ratio = Math.min(1, limit / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function safeFileName(name: string, fallback: string) {
  const next = (name || fallback).replace(/[\\/:*?"<>|]+/g, "-").trim();
  return next || fallback;
}

function replaceExtension(name: string, extension: string) {
  const safe = safeFileName(name, `upload-${Date.now()}${extension}`);
  return extensionFromName(safe) ? safe.replace(/\.[^.]+$/, extension) : `${safe}${extension}`;
}

function normalizeMimeType(file: File, kind: UploadKind, policy: UploadPolicy) {
  return file.type || mimeFromExtension(extensionFromName(file.name), kind, policy) || (kind === "image" ? "image/webp" : "application/octet-stream");
}

function ensureUploadFile(file: File, kind: UploadKind, policy: UploadPolicy) {
  const mimeType = normalizeMimeType(file, kind, policy);
  const extension = extensionFromName(file.name) || extensionFromMime(mimeType, kind, policy);
  const fileName = safeFileName(file.name || `upload-${Date.now()}${extension}`, `upload-${Date.now()}${extension}`);
  if (fileName === file.name && mimeType === file.type) return file;
  return new File([file], fileName, { type: mimeType, lastModified: file.lastModified });
}

async function convertImageToWebp(file: File, policy: UploadPolicy) {
  if (file.type === "image/gif" || extensionFromName(file.name) === ".gif") {
    return ensureUploadFile(file, "image", policy);
  }

  try {
    const bitmap = await createImageBitmap(file);
    const size = maxDimension(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持图片压缩");
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((next) => next ? resolve(next) : reject(new Error("图片转换失败")), "image/webp", 0.82);
    });
    return new File([blob], replaceExtension(file.name || `pasted-image-${Date.now()}`, ".webp"), { type: "image/webp" });
  } catch {
    return ensureUploadFile(file, "image", policy);
  }
}

function kindFromFile(file: File, policy: UploadPolicy): UploadKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  const extension = extensionFromName(file.name);
  if (policy.image.extensions.includes(extension)) return "image";
  if (policy.video.extensions.includes(extension)) return "video";
  return "file";
}

export function useUpload() {
  async function uploadFile(file: File, docUid: string) {
    const policy = await loadUploadPolicy();
    const kind = kindFromFile(file, policy);
    const prepared = kind === "image" ? await convertImageToWebp(file, policy) : ensureUploadFile(file, kind, policy);
    const input = {
      fileName: prepared.name,
      mimeType: prepared.type || "application/octet-stream",
      size: prepared.size,
      kind,
      docUid
    };
    const presigned = await presignUploadApi(input);
    let put: Response;
    try {
      put = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": input.mimeType },
        body: prepared
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

  return { uploadFile };
}
