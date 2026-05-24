import { DeleteObjectCommand, GetBucketCorsCommand, HeadObjectCommand, PutBucketCorsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { CORSRule, HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { extname } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db, dbGet, dbRun } from "../../db/client.js";
import { uploads } from "../../db/schema.js";
import { createR2Client, getR2CorsAllowedOrigins } from "../../config/r2.js";
import { env } from "../../config/env.js";
import { assertR2Ready, type R2Config } from "../settings/settings.service.js";
import { now } from "../../utils/date.js";

const presignSchema = z.object({
  fileName: z.string().min(1).max(220),
  mimeType: z.string().min(3).max(120),
  size: z.number().int().positive(),
  kind: z.enum(["image", "video", "file"]),
  docId: z.number().int().positive().optional().nullable()
});

const completeSchema = presignSchema.extend({
  uploadToken: z.string().min(20),
  objectKey: z.string().min(8).max(260).optional(),
  publicUrl: z.string().url().optional()
});

const uploadTokenSchema = z.object({
  objectKey: z.string().min(8).max(260),
  fileName: z.string().min(1).max(220),
  mimeType: z.string().min(3).max(120),
  size: z.number().int().positive(),
  kind: z.enum(["image", "video", "file"]),
  docId: z.number().int().positive().nullable()
});

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
    AllowedHeaders: ["*"],
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
  if (!allowedMime) throw new Error("文件后缀不允许");
  if (!allowedMime.includes(normalizeMimeType(body.mimeType))) throw new Error("文件 MIME 类型与后缀不匹配");
  if (body.size > policy.maxMb * 1024 * 1024) throw new Error("文件超过大小限制");
}

function validateCompletedObject(expected: z.infer<typeof uploadTokenSchema>, object: HeadObjectCommandOutput) {
  if (object.ContentLength !== expected.size) {
    throw new Error("R2 对象大小与上传凭证不匹配");
  }

  const actualMimeType = normalizeMimeType(object.ContentType ?? "");
  if (!actualMimeType) {
    throw new Error("R2 对象缺少 Content-Type");
  }
  if (actualMimeType !== normalizeMimeType(expected.mimeType)) {
    throw new Error("R2 对象 Content-Type 与上传凭证不匹配");
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

export async function createPresignedUpload(input: unknown) {
  const body = normalizeUploadInput(presignSchema.parse(input));
  validateFile(body);
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
    objectKey: key,
    fileName: body.fileName,
    mimeType: body.mimeType,
    size: body.size,
    kind: body.kind,
    docId: body.docId ?? null
  });
  return {
    uploadUrl,
    uploadToken,
    objectKey: key,
    publicUrl
  };
}

export async function completeUpload(userId: number, input: unknown) {
  const body = normalizeUploadInput(completeSchema.parse(input));
  const tokenPayload = verifyUploadToken(body.uploadToken);
  if (body.objectKey && body.objectKey !== tokenPayload.objectKey) {
    throw new Error("上传对象不匹配");
  }
  if (!objectKeyPattern.test(tokenPayload.objectKey)) {
    throw new Error("对象路径不正确");
  }
  if (
    body.fileName !== tokenPayload.fileName ||
    body.mimeType !== tokenPayload.mimeType ||
    body.size !== tokenPayload.size ||
    body.kind !== tokenPayload.kind ||
    (body.docId ?? null) !== tokenPayload.docId
  ) {
    throw new Error("上传完成参数不匹配");
  }

  validateFile(tokenPayload);
  const config = await assertR2Ready();
  const client = createR2Client(config);
  const uploadedObject = await client.send(new HeadObjectCommand({
    Bucket: config.bucket,
    Key: tokenPayload.objectKey
  }));
  validateCompletedObject(tokenPayload, uploadedObject);
  const publicUrl = publicUrlFromKey(config, tokenPayload.objectKey);
  const result = await dbRun(db.insert(uploads).values({
    userId,
    docId: tokenPayload.docId,
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

export async function deleteUpload(id: number) {
  const upload = await dbGet<typeof uploads.$inferSelect>(db.select().from(uploads).where(eq(uploads.id, id)).limit(1));
  if (!upload) return { deleted: false };

  const config = await assertR2Ready();
  const client = createR2Client(config);
  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: upload.objectKey
  }));
  await dbRun(db.delete(uploads).where(eq(uploads.id, id)));
  return { deleted: true };
}
