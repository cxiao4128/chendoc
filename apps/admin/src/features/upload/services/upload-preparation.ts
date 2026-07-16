import type { UploadPolicy } from "../../../api/uploads";
import {
  extensionFromName,
  normalizeClientMimeType,
  readBlobBytes,
  sniffFileFormat,
  zipMatchesOfficeExtension,
  type DetectedFormat
} from "./upload-format-detection";
import { transcodeImage } from "./upload-image-transcode";

export { normalizeClientMimeType, sniffFileFormat };
export type { DetectedFormat };

export type UploadKind = "image" | "video" | "file";

export interface PreparedUpload {
  file: File;
  kind: UploadKind;
  mimeType: string;
  extension: string;
  detectedFormat: Exclude<DetectedFormat, "unknown">;
}

const DANGEROUS_SOURCE_EXTENSIONS = new Set([
  ".apk", ".app", ".bat", ".bash", ".bin", ".cmd", ".com", ".cpl", ".dll", ".dmg", ".exe", ".gadget",
  ".hta", ".htm", ".html", ".jar", ".js", ".jse", ".mjs", ".msi", ".msp", ".phtml", ".php", ".ps1",
  ".psm1", ".scr", ".sh", ".svg", ".svgz", ".vb", ".vbe", ".vbs", ".wsf", ".wsh"
]);
const TEXT_SOURCE_EXTENSIONS = new Set([".txt", ".md"]);
const ZIP_SOURCE_EXTENSIONS = new Set([".zip", ".docx", ".xlsx", ".pptx"]);

function safeFileName(name: string, fallback: string) {
  const next = (name || fallback).replace(/[\\/:*?"<>|]+/g, "-").trim();
  return next || fallback;
}

function replaceExtension(name: string, extension: string) {
  const fallback = `upload-${Date.now()}${extension}`;
  const safe = safeFileName(name, fallback);
  return extensionFromName(safe) ? safe.replace(/\.[^.]+$/, extension) : `${safe}${extension}`;
}

function mimeForExtension(extension: string, kind: UploadKind, policy: UploadPolicy, preferred = "") {
  const allowed = policy[kind].mimeByExtension[extension]?.map(normalizeClientMimeType) ?? [];
  const normalizedPreferred = normalizeClientMimeType(preferred);
  if (normalizedPreferred && allowed.includes(normalizedPreferred)) return normalizedPreferred;
  return allowed[0] || "";
}

function resolvedFormat(file: File, format: Exclude<DetectedFormat, "unknown">, policy: UploadPolicy) {
  const originalExtension = extensionFromName(file.name);
  const originalMime = normalizeClientMimeType(file.type);
  let kind: UploadKind;
  let extension: string;
  let defaultMime: string;

  switch (format) {
    case "jpeg": [kind, extension, defaultMime] = ["image", ".jpg", "image/jpeg"]; break;
    case "png": [kind, extension, defaultMime] = ["image", ".png", "image/png"]; break;
    case "gif": [kind, extension, defaultMime] = ["image", ".gif", "image/gif"]; break;
    case "webp": [kind, extension, defaultMime] = ["image", ".webp", "image/webp"]; break;
    case "avif": [kind, extension, defaultMime] = ["image", ".avif", "image/avif"]; break;
    case "heif": return { kind: "image" as const, extension: ".heic", mimeType: "image/heic" };
    case "mp4": [kind, extension, defaultMime] = ["video", ".mp4", "video/mp4"]; break;
    case "mov": [kind, extension, defaultMime] = ["video", ".mov", "video/quicktime"]; break;
    case "m4v": [kind, extension, defaultMime] = ["video", ".m4v", "video/mp4"]; break;
    case "webm": [kind, extension, defaultMime] = ["video", ".webm", "video/webm"]; break;
    case "ogv": [kind, extension, defaultMime] = ["video", ".ogv", "video/ogg"]; break;
    case "pdf": [kind, extension, defaultMime] = ["file", ".pdf", "application/pdf"]; break;
    case "zip": {
      kind = "file";
      extension = [".zip", ".docx", ".xlsx", ".pptx"].includes(originalExtension) ? originalExtension : ".zip";
      defaultMime = mimeForExtension(extension, kind, policy, originalMime);
      break;
    }
    case "ole": {
      if (![".doc", ".xls", ".ppt"].includes(originalExtension)) {
        throw new Error("无法判断旧版 Office 文件类型，请保留 .doc、.xls 或 .ppt 后缀");
      }
      kind = "file";
      extension = originalExtension;
      defaultMime = mimeForExtension(extension, kind, policy, originalMime);
      break;
    }
    case "text": {
      kind = "file";
      extension = originalExtension === ".md" ? ".md" : ".txt";
      defaultMime = mimeForExtension(extension, kind, policy, originalMime);
      break;
    }
  }

  const mimeType = mimeForExtension(extension, kind, policy, defaultMime || originalMime);
  if (!mimeType) throw new Error("此文件格式未被服务器允许");
  return { kind, extension, mimeType };
}

function correctedFile(file: File, extension: string, mimeType: string) {
  const name = replaceExtension(file.name || `upload-${Date.now()}`, extension);
  if (file.name === name && normalizeClientMimeType(file.type) === mimeType) return file;
  return new File([file], name, { type: mimeType, lastModified: file.lastModified });
}

export async function prepareUpload(file: File, policy: UploadPolicy): Promise<PreparedUpload> {
  const sourceExtension = extensionFromName(file.name);
  if (DANGEROUS_SOURCE_EXTENSIONS.has(sourceExtension)) {
    throw new Error(`不允许上传 ${sourceExtension} 文件`);
  }
  const sourceBytes = await readBlobBytes(file, 64 * 1024);
  const sourceFormat = sniffFileFormat(sourceBytes, file.name);
  if (sourceFormat === "unknown") {
    throw new Error("无法识别文件真实格式，请确认文件未损坏且格式受支持");
  }
  if (sourceFormat === "text" && !TEXT_SOURCE_EXTENSIONS.has(sourceExtension)) {
    throw new Error("文本附件仅支持 .txt 和 .md 格式");
  }
  if (sourceFormat === "zip" && !ZIP_SOURCE_EXTENSIONS.has(sourceExtension)) {
    throw new Error("压缩或 Office 附件仅支持 .zip、.docx、.xlsx 和 .pptx 格式");
  }
  if (sourceFormat === "zip" && !zipMatchesOfficeExtension(sourceBytes, sourceExtension)) {
    throw new Error("文件内容与 Office 后缀不匹配");
  }

  const resolved = resolvedFormat(file, sourceFormat, policy);
  const original = correctedFile(file, resolved.extension, resolved.mimeType);
  if (resolved.kind !== "image" || sourceFormat === "gif") {
    return { file: original, ...resolved, detectedFormat: sourceFormat };
  }

  try {
    const converted = await transcodeImage(original, sourceFormat);
    if (converted) {
      const mimeType = mimeForExtension(converted.extension, "image", policy, converted.mimeType);
      if (!mimeType) throw new Error("服务器不允许转换后的图片格式");
      const convertedFile = new File(
        [converted.blob],
        replaceExtension(file.name || `pasted-image-${Date.now()}`, converted.extension),
        { type: mimeType, lastModified: file.lastModified }
      );
      return {
        file: convertedFile,
        kind: "image",
        mimeType,
        extension: converted.extension,
        detectedFormat: converted.format
      };
    }
  } catch (error) {
    if (sourceFormat === "heif") {
      throw new Error("当前浏览器无法转换 HEIC/HEIF 图片，请先在相册中转换为 JPEG 或 PNG", { cause: error });
    }
  }

  if (sourceFormat === "heif") {
    throw new Error("当前浏览器无法转换 HEIC/HEIF 图片，请先在相册中转换为 JPEG 或 PNG");
  }
  return { file: original, ...resolved, detectedFormat: sourceFormat };
}
