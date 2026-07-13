import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { extname } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { docs, uploads } from "./uploads.repo.js";
export { docs, uploads };

import {
  getDocIdForUpload,
  getUploadByObjectKey,
  getUploadById,
  insertUpload,
  deleteUploadById,
  getUploadQuota,
  getUploadDocRef
} from "./uploads.repo.js";
import { createR2Client } from "../../config/r2.js";
import { env } from "../../config/env.js";
import { assertR2Ready } from "../settings/storage.service.js";
import type { R2Config } from "../settings/types.js";
import { now } from "../../utils/date.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { canAccessDocument } from "../docs/documentAccess.js";

const presignSchema = z.object({
  fileName: z.string().min(1).max(220),
  mimeType: z.string().min(3).max(120),
  size: z.number().int().positive(),
  kind: z.enum(["image", "video", "file"]),
  docUid: z.string().trim().regex(/^[A-Za-z0-9]{16,32}$/)
});

const completeSchema = presignSchema.extend({
  uploadToken: z.string().min(20),
  objectKey: z.string().min(8).max(260).optional(),
  publicUrl: z.string().url().optional()
});

const uploadTokenSchema = z.object({
  userId: z.number().int().positive(),
  objectKey: z.string().min(8).max(260),
  fileName: z.string().min(1).max(220),
  mimeType: z.string().min(3).max(120),
  size: z.number().int().positive(),
  kind: z.enum(["image", "video", "file"]),
  docUid: z.string().regex(/^[A-Za-z0-9]{16,32}$/)
});

export type Actor = { id: number; role: "admin" | "user"; isSuperAdmin?: boolean };
export type UploadKind = z.infer<typeof presignSchema>["kind"];
type UploadPolicy = Record<UploadKind, {
  mimeByExtension: Record<string, string[]>;
  maxMb: number;
}>;

const objectKeyPattern = /^docs\/(images|videos|files)\/\d{4}\/\d{2}\/\d+-[a-f0-9]{24}\.[A-Za-z0-9]+$/;
const uploadUserLocks = new Map<number, Promise<void>>();

async function withUploadUserLock<T>(userId: number, action: () => Promise<T>) {
  const previous = uploadUserLocks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  uploadUserLocks.set(userId, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (uploadUserLocks.get(userId) === queued) uploadUserLocks.delete(userId);
  }
}

const uploadPolicy: UploadPolicy = {
  image: {
    mimeByExtension: {
      ".webp": ["image/webp"],
      ".gif": ["image/gif"],
      ".png": ["image/png"],
      ".jpg": ["image/jpeg"],
      ".jpeg": ["image/jpeg"],
      ".avif": ["image/avif"]
    },
    maxMb: env.uploadLimits.imageMb
  },
  video: {
    mimeByExtension: {
      ".mp4": ["video/mp4"],
      ".webm": ["video/webm"],
      ".mov": ["video/quicktime"],
      ".m4v": ["video/mp4"],
      ".ogv": ["video/ogg"]
    },
    maxMb: env.uploadLimits.videoMb
  },
  file: {
    mimeByExtension: {
      ".pdf": ["application/pdf"],
      ".zip": ["application/zip"],
      ".txt": ["text/plain"],
      ".md": ["text/markdown", "text/plain"],
      ".doc": ["application/msword"],
      ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ".xls": ["application/vnd.ms-excel"],
      ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ".ppt": ["application/vnd.ms-powerpoint"],
      ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"]
    },
    maxMb: env.uploadLimits.fileMb
  }
};

function randomName(ext: string) {
  return `${Date.now()}-${randomBytes(12).toString("hex")}${ext}`;
}

function objectKey(kind: "image" | "video" | "file", fileName: string) {
  const date = new Date();
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const ext = extname(fileName).toLowerCase();
  const folder = kind === "image" ? "images" : kind === "video" ? "videos" : "files";
  return `docs/${folder}/${yyyy}/${mm}/${randomName(ext)}`;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "";
}

function normalizeUploadInput<T extends z.infer<typeof presignSchema>>(body: T): T {
  return {
    ...body,
    mimeType: normalizeMimeType(body.mimeType)
  } as T;
}

function policyMimeList(kind: UploadKind) {
  return unique(Object.values(uploadPolicy[kind].mimeByExtension).flat());
}

export function getUploadPolicy() {
  return {
    security: { scanRequired: env.requireUploadScan, documentBindingRequired: true },
    image: {
      extensions: Object.keys(uploadPolicy.image.mimeByExtension),
      mime: policyMimeList("image"),
      mimeByExtension: uploadPolicy.image.mimeByExtension,
      maxMb: uploadPolicy.image.maxMb,
      maxBytes: uploadPolicy.image.maxMb * 1024 * 1024
    },
    video: {
      extensions: Object.keys(uploadPolicy.video.mimeByExtension),
      mime: policyMimeList("video"),
      mimeByExtension: uploadPolicy.video.mimeByExtension,
      maxMb: uploadPolicy.video.maxMb,
      maxBytes: uploadPolicy.video.maxMb * 1024 * 1024
    },
    file: {
      extensions: Object.keys(uploadPolicy.file.mimeByExtension),
      mime: policyMimeList("file"),
      mimeByExtension: uploadPolicy.file.mimeByExtension,
      maxMb: uploadPolicy.file.maxMb,
      maxBytes: uploadPolicy.file.maxMb * 1024 * 1024
    }
  };
}

function validateFile(body: z.infer<typeof presignSchema>) {
  const policy = uploadPolicy[body.kind];
  const ext = extname(body.fileName).toLowerCase();
  const allowedMime = policy.mimeByExtension[ext];
  if (!allowedMime) throw new BadRequestError("文件后缀不允许", "UPLOAD_EXTENSION_NOT_ALLOWED");
  if (!allowedMime.includes(normalizeMimeType(body.mimeType))) throw new BadRequestError("文件 MIME 类型与后缀不匹配", "UPLOAD_MIME_MISMATCH");
  if (body.size > policy.maxMb * 1024 * 1024) throw new BadRequestError("文件超过大小限制", "UPLOAD_TOO_LARGE");

  const finalExt = extname(body.fileName.replace(/^.*\./, "").toLowerCase());
  if (finalExt && finalExt !== ext) {
    throw new BadRequestError("文件名包含可疑后缀", "UPLOAD_DOUBLE_EXTENSION_BLOCKED");
  }
}

function validateCompletedObject(expected: z.infer<typeof uploadTokenSchema>, object: HeadObjectCommandOutput) {
  if (object.ContentLength !== expected.size) {
    throw new BadRequestError("R2 对象大小与上传凭证不匹配", "UPLOAD_SIZE_MISMATCH");
  }

  const actualMimeType = normalizeMimeType(object.ContentType ?? "");
  if (!actualMimeType) {
    throw new BadRequestError("R2 对象缺少 Content-Type", "UPLOAD_CONTENT_TYPE_MISSING");
  }
  if (actualMimeType !== normalizeMimeType(expected.mimeType)) {
    throw new BadRequestError("R2 对象 Content-Type 与上传凭证不匹配", "UPLOAD_CONTENT_TYPE_MISMATCH");
  }
  validateFile({ ...expected, mimeType: actualMimeType });
}

function publicUrlFromKey(config: R2Config, key: string) {
  return `${config.publicUrl.replace(/\/+$/, "")}/${key}`;
}

function signUploadToken(payload: z.infer<typeof uploadTokenSchema>) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: "10m",
    audience: "chendoc-upload",
    issuer: "chendoc"
  });
}

function verifyUploadToken(token: string) {
  const decoded = jwt.verify(token, env.jwtSecret, {
    audience: "chendoc-upload",
    issuer: "chendoc"
  });
  return uploadTokenSchema.parse(decoded);
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function contentMatchesExtension(fileName: string, bytes: Uint8Array) {
  const ext = extname(fileName).toLowerCase();
  const text = Buffer.from(bytes).toString("ascii");
  if (ext === ".png") return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47]);
  if (ext === ".jpg" || ext === ".jpeg") return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  if (ext === ".gif") return text.startsWith("GIF87a") || text.startsWith("GIF89a");
  if (ext === ".webp") return text.startsWith("RIFF") && text.slice(8, 12) === "WEBP";
  if (ext === ".avif") return text.slice(4, 12) === "ftypavif" || text.slice(4, 12) === "ftypavis";
  if (ext === ".pdf") return text.startsWith("%PDF-");
  if ([".zip", ".docx", ".xlsx", ".pptx"].includes(ext)) {
    return startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06]);
  }
  if ([".doc", ".xls", ".ppt"].includes(ext)) return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if ([".mp4", ".mov", ".m4v"].includes(ext)) return text.slice(4, 8) === "ftyp";
  if (ext === ".webm") return startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  if (ext === ".ogv") return text.startsWith("OggS");
  if (ext === ".txt" || ext === ".md") return !bytes.includes(0);
  return false;
}

async function validateObjectSignature(client: ReturnType<typeof createR2Client>, config: R2Config, expected: z.infer<typeof uploadTokenSchema>) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const response = await client.send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: expected.objectKey,
    Range: "bytes=0-4095"
  }));
  const body = response.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  const bytes = body?.transformToByteArray ? await body.transformToByteArray() : new Uint8Array();
  if (!bytes.length || !contentMatchesExtension(expected.fileName, bytes)) {
    throw new BadRequestError("文件真实格式与后缀不匹配", "UPLOAD_SIGNATURE_MISMATCH");
  }
}

async function scanCompletedUpload(input: { publicUrl: string; objectKey: string; mimeType: string; size: number }) {
  if (!env.uploadScanWebhook) {
    if (env.requireUploadScan) throw new BadRequestError("文件安全扫描未配置，上传已拒绝", "UPLOAD_SCAN_REQUIRED");
    return;
  }
  const response = await fetch(env.uploadScanWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new BadRequestError("文件安全扫描暂不可用", "UPLOAD_SCAN_UNAVAILABLE");
  const result = await response.json() as { clean?: boolean };
  if (!result.clean) throw new BadRequestError("文件未通过安全扫描", "UPLOAD_SCAN_REJECTED");
}

async function resolveDocIdForUpload(docUid: string, actor: Actor) {
  const doc = await getDocIdForUpload(docUid);
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  if (!canAccessDocument(actor, doc, "update")) throw new ForbiddenError("无权访问该文档", "DOC_FORBIDDEN");
  return doc.id;
}

async function assertUploadQuota(userId: number, incomingBytes: number) {
  const quota = await getUploadQuota(
    userId,
    incomingBytes,
    env.uploadQuota.dailyFiles,
    env.uploadQuota.dailyBytes,
    env.uploadQuota.storedBytesPerUser
  );
  if (!quota.ok) throw new BadRequestError(quota.reason, quota.code);
}

export async function createPresignedUpload(userId: number, actor: Actor, input: unknown) {
  const body = normalizeUploadInput(presignSchema.parse(input));
  validateFile(body);
  await resolveDocIdForUpload(body.docUid, actor);
  await assertUploadQuota(userId, body.size);
  const config = await assertR2Ready();
  const client = createR2Client(config);
  const key = objectKey(body.kind, body.fileName);
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: body.mimeType,
    ContentLength: body.size
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  const publicUrl = publicUrlFromKey(config, key);
  const uploadToken = signUploadToken({
    userId,
    objectKey: key,
    fileName: body.fileName,
    mimeType: body.mimeType,
    size: body.size,
    kind: body.kind,
    docUid: body.docUid
  });
  return {
    uploadUrl,
    uploadToken,
    objectKey: key,
    publicUrl
  };
}

export async function completeUpload(userId: number, actor: Actor, input: unknown) {
  const body = normalizeUploadInput(completeSchema.parse(input));
  const tokenPayload = verifyUploadToken(body.uploadToken);
  if (tokenPayload.userId !== userId) {
    throw new ForbiddenError("上传凭证不属于当前用户", "UPLOAD_TOKEN_FORBIDDEN");
  }
  if (body.objectKey && body.objectKey !== tokenPayload.objectKey) {
    throw new BadRequestError("上传对象不匹配", "UPLOAD_OBJECT_MISMATCH");
  }
  if (!objectKeyPattern.test(tokenPayload.objectKey)) {
    throw new BadRequestError("对象路径不正确", "UPLOAD_OBJECT_KEY_INVALID");
  }
  if (
    body.fileName !== tokenPayload.fileName ||
    body.mimeType !== tokenPayload.mimeType ||
    body.size !== tokenPayload.size ||
    body.kind !== tokenPayload.kind ||
    body.docUid !== tokenPayload.docUid
  ) {
    throw new BadRequestError("上传完成参数不匹配", "UPLOAD_COMPLETE_MISMATCH");
  }

  const docId = await resolveDocIdForUpload(tokenPayload.docUid, actor);
  await assertUploadQuota(userId, tokenPayload.size);
  validateFile(tokenPayload);
  const config = await assertR2Ready();
  const client = createR2Client(config);
  const uploadedObject = await client.send(new HeadObjectCommand({
    Bucket: config.bucket,
    Key: tokenPayload.objectKey
  }));
  validateCompletedObject(tokenPayload, uploadedObject);
  try {
    await validateObjectSignature(client, config, tokenPayload);
  } catch (error) {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: tokenPayload.objectKey })).catch(() => undefined);
    throw error;
  }
  const publicUrl = publicUrlFromKey(config, tokenPayload.objectKey);
  const existing = await getUploadByObjectKey(tokenPayload.objectKey);
  if (existing) {
    if (existing.userId !== userId || existing.docId !== docId) throw new ForbiddenError("上传对象已被占用", "UPLOAD_OBJECT_FORBIDDEN");
    return { id: existing.id, publicUrl: existing.publicUrl };
  }
  try {
    await scanCompletedUpload({ publicUrl, objectKey: tokenPayload.objectKey, mimeType: tokenPayload.mimeType, size: tokenPayload.size });
  } catch (error) {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: tokenPayload.objectKey })).catch(() => undefined);
    throw error;
  }
  return await withUploadUserLock(userId, async () => {
    const raced = await getUploadByObjectKey(tokenPayload.objectKey);
    if (raced) {
      if (raced.userId !== userId || raced.docId !== docId) throw new ForbiddenError("上传对象已被占用", "UPLOAD_OBJECT_FORBIDDEN");
      return { id: raced.id, publicUrl: raced.publicUrl };
    }
    await assertUploadQuota(userId, tokenPayload.size);
    try {
      return await insertUpload({
        userId,
        docId,
        objectKey: tokenPayload.objectKey,
        publicUrl,
        mimeType: tokenPayload.mimeType,
        fileSize: tokenPayload.size,
        kind: tokenPayload.kind,
        originalName: tokenPayload.fileName,
        createdAt: now()
      });
    } catch (error) {
      const committed = await getUploadByObjectKey(tokenPayload.objectKey);
      if (committed) {
        if (committed.userId !== userId || committed.docId !== docId) {
          throw new ForbiddenError("上传对象已被占用", "UPLOAD_OBJECT_FORBIDDEN");
        }
        return { id: committed.id, publicUrl: committed.publicUrl };
      }
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: tokenPayload.objectKey })).catch(() => undefined);
      throw error;
    }
  });
}

export async function deleteUpload(id: number, actor: Actor) {
  const upload = await getUploadById(id);
  if (!upload) return { deleted: false };
  if (!actor.isSuperAdmin && upload.userId !== actor.id) {
    throw new ForbiddenError("无权删除该附件", "UPLOAD_FORBIDDEN");
  }

  const docRef = await getUploadDocRef(id);
  if (docRef && docRef.docId !== null && !canAccessDocument(actor, docRef, "delete")) {
    throw new ForbiddenError("无权删除该附件", "UPLOAD_FORBIDDEN");
  }

  const config = await assertR2Ready();
  const client = createR2Client(config);
  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: upload.objectKey
  }));
  await deleteUploadById(id);
  return { deleted: true, ownerId: upload.userId, docId: upload.docId };
}
