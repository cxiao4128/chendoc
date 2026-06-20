import { DeleteObjectCommand, GetBucketCorsCommand, HeadObjectCommand, PutBucketCorsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { CORSRule, HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq, isNull } from "drizzle-orm";
import { extname } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db, dbGet, dbRun } from "../../db/client.js";
import { docs, uploads } from "../../db/schema.js";
import { createR2Client, getR2CorsAllowedOrigins } from "../../config/r2.js";
import { env } from "../../config/env.js";
import { assertR2Ready, type R2Config } from "../settings/settings.service.js";
import { now } from "../../utils/date.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";

const presignSchema = z.object({
  fileName: z.string().min(1).max(220),
  mimeType: z.string().min(3).max(120),
  size: z.number().int().positive(),
  kind: z.enum(["image", "video", "file"]),
  docUid: z.string().trim().regex(/^[A-Za-z0-9]{16,32}$/).optional().nullable()
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
  docUid: z.string().regex(/^[A-Za-z0-9]{16,32}$/).nullable()
});

type Actor = { id: number; role: "admin" | "user"; isSuperAdmin?: boolean };
type UploadKind = z.infer<typeof presignSchema>["kind"];
type UploadPolicy = Record<UploadKind, {
  mimeByExtension: Record<string, string[]>;
  maxMb: number;
}>;

const objectKeyPattern = /^docs\/(images|videos|files)\/\d{4}\/\d{2}\/\d+-[a-f0-9]{24}\.[A-Za-z0-9]+$/;
const corsReadyBuckets = new Set<string>();

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

function createUploadCorsRule(): CORSRule {
  return {
    ID: "chendoc-browser-upload",
    AllowedHeaders: ["content-type", "content-length", "x-amz-*"],
    AllowedMethods: ["GET", "HEAD", "PUT"],
    AllowedOrigins: getR2CorsAllowedOrigins(),
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600
  };
}

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

function isCorsPermissionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { name?: string; Code?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  return (
    maybe.name === "AccessDenied" ||
    maybe.Code === "AccessDenied" ||
    maybe.code === "AccessDenied" ||
    maybe.$metadata?.httpStatusCode === 403
  );
}

async function ensureBrowserUploadCors(config: R2Config, client: ReturnType<typeof createR2Client>) {
  const uploadCorsRule = createUploadCorsRule();
  const cacheKey = `${config.endpoint || config.accountId}/${config.bucket}/${uploadCorsRule.AllowedOrigins?.join(",")}`;
  if (corsReadyBuckets.has(cacheKey)) return;
  let existingRules: CORSRule[] = [];
  try {
    const existing = await client.send(new GetBucketCorsCommand({ Bucket: config.bucket }));
    existingRules = existing.CORSRules ?? [];
  } catch (error) {
    if (isCorsPermissionError(error)) {
      corsReadyBuckets.add(cacheKey);
      return;
    }
    existingRules = [];
  }

  try {
    await client.send(new PutBucketCorsCommand({
      Bucket: config.bucket,
      CORSConfiguration: {
        CORSRules: [
          ...existingRules.filter((rule) => rule.ID !== uploadCorsRule.ID),
          uploadCorsRule
        ]
      }
    }));
  } catch (error) {
    if (!isCorsPermissionError(error)) throw error;
  }
  corsReadyBuckets.add(cacheKey);
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

async function scanCompletedUpload(input: { publicUrl: string; objectKey: string; mimeType: string; size: number }) {
  if (!env.uploadScanWebhook) return;
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

async function uploadDocId(docUid: string | null | undefined, actor: Actor) {
  if (!docUid) return null;
  const doc = await dbGet<{ id: number; ownerId: number | null; isSuperAdminDoc: boolean }>(db
    .select({ id: docs.id, ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
    .from(docs)
    .where(and(eq(docs.docUid, docUid), isNull(docs.deletedAt)))
    .limit(1));
  if (!doc) throw new NotFoundError("文档不存在", "DOC_NOT_FOUND");
  if (!actor.isSuperAdmin && doc.isSuperAdminDoc) throw new ForbiddenError("无权访问该文档", "DOC_FORBIDDEN");
  if (actor.role !== "admin" && doc.ownerId !== actor.id) throw new ForbiddenError("无权访问该文档", "DOC_FORBIDDEN");
  return doc.id;
}

export async function createPresignedUpload(userId: number, actor: Actor, input: unknown) {
  const body = normalizeUploadInput(presignSchema.parse(input));
  validateFile(body);
  await uploadDocId(body.docUid ?? null, actor);
  const config = await assertR2Ready();
  const client = createR2Client(config);
  await ensureBrowserUploadCors(config, client);
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
    docUid: body.docUid ?? null
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
    (body.docUid ?? null) !== tokenPayload.docUid
  ) {
    throw new BadRequestError("上传完成参数不匹配", "UPLOAD_COMPLETE_MISMATCH");
  }

  const docId = await uploadDocId(tokenPayload.docUid, actor);
  validateFile(tokenPayload);
  const config = await assertR2Ready();
  const client = createR2Client(config);
  const uploadedObject = await client.send(new HeadObjectCommand({
    Bucket: config.bucket,
    Key: tokenPayload.objectKey
  }));
  validateCompletedObject(tokenPayload, uploadedObject);
  const publicUrl = publicUrlFromKey(config, tokenPayload.objectKey);
  try {
    await scanCompletedUpload({ publicUrl, objectKey: tokenPayload.objectKey, mimeType: tokenPayload.mimeType, size: tokenPayload.size });
  } catch (error) {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: tokenPayload.objectKey })).catch(() => undefined);
    throw error;
  }
  const result = await dbRun(db.insert(uploads).values({
    userId,
    docId,
    objectKey: tokenPayload.objectKey,
    publicUrl,
    mimeType: tokenPayload.mimeType,
    fileSize: tokenPayload.size,
    kind: tokenPayload.kind,
    originalName: tokenPayload.fileName,
    createdAt: now()
  }));
  return { id: Number(result.lastInsertRowid), publicUrl };
}

export async function deleteUpload(id: number, actor: Actor) {
  const upload = await dbGet<typeof uploads.$inferSelect>(db.select().from(uploads).where(eq(uploads.id, id)).limit(1));
  if (!upload) return { deleted: false };
  if (actor.role !== "admin" && upload.userId !== actor.id) {
    throw new ForbiddenError("无权删除该附件", "UPLOAD_FORBIDDEN");
  }
  if (upload.docId) {
    const doc = await dbGet<{ ownerId: number | null; isSuperAdminDoc: boolean }>(db
      .select({ ownerId: docs.ownerId, isSuperAdminDoc: docs.isSuperAdminDoc })
      .from(docs).where(eq(docs.id, upload.docId)).limit(1));
    if (doc && !actor.isSuperAdmin && doc.isSuperAdminDoc) throw new ForbiddenError("无权删除该附件", "UPLOAD_FORBIDDEN");
    if (actor.role !== "admin" && doc?.ownerId !== actor.id) throw new ForbiddenError("无权删除该附件", "UPLOAD_FORBIDDEN");
  }

  const config = await assertR2Ready();
  const client = createR2Client(config);
  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: upload.objectKey
  }));
  await dbRun(db.delete(uploads).where(eq(uploads.id, id)));
  return { deleted: true, ownerId: upload.userId, docId: upload.docId };
}
