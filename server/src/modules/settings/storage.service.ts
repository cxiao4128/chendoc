// Storage settings service - R2 configuration

import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, getR2CorsAllowedOrigins } from "../../config/r2.js";
import { env } from "../../config/env.js";
import { setSettings } from "./core.service.js";
import { settingValues } from "./core.repo.js";
import { valueFromSettings } from "./core.repo.js";
import { maskSecret } from "../../utils/maskSecret.js";
import type { R2Config } from "./types.js";

import { r2ConfigSchema } from "./storage.repo.js";

export async function getR2Config(revealSecrets = true): Promise<R2Config> {
  const values = await settingValues([
    "r2.account_id",
    "r2.access_key_id",
    "r2.secret_access_key",
    "r2.bucket",
    "r2.public_url",
    "r2.endpoint",
    "r2.region"
  ]);

  const config = {
    accountId: valueFromSettings(values, "r2.account_id", env.r2.accountId),
    accessKeyId: valueFromSettings(values, "r2.access_key_id", env.r2.accessKeyId),
    secretAccessKey: valueFromSettings(values, "r2.secret_access_key", env.r2.secretAccessKey),
    bucket: valueFromSettings(values, "r2.bucket", env.r2.bucket),
    publicUrl: valueFromSettings(values, "r2.public_url", env.r2.publicUrl),
    endpoint: valueFromSettings(values, "r2.endpoint", env.r2.endpoint),
    region: valueFromSettings(values, "r2.region", env.r2.region || "auto")
  };

  if (!revealSecrets) {
    return {
      ...config,
      accessKeyId: maskSecret(config.accessKeyId),
      secretAccessKey: maskSecret(config.secretAccessKey)
    };
  }

  return config;
}

export async function saveR2Config(input: unknown): Promise<R2Config> {
  const body = r2ConfigSchema.parse(input);
  const existing = await getR2Config(true);
  const accessKeyId = body.accessKeyId === maskSecret(existing.accessKeyId) ? "" : body.accessKeyId;
  const secretAccessKey = body.secretAccessKey === maskSecret(existing.secretAccessKey) ? "" : body.secretAccessKey;
  if (!accessKeyId && !existing.accessKeyId) throw new Error("R2 Access Key ID 不能为空");
  if (!secretAccessKey && !existing.secretAccessKey) throw new Error("R2 Secret Access Key 不能为空");
  await setSettings([
    { key: "r2.account_id", value: body.accountId },
    ...(accessKeyId ? [{ key: "r2.access_key_id", value: accessKeyId }] : []),
    ...(secretAccessKey ? [{ key: "r2.secret_access_key", value: secretAccessKey }] : []),
    { key: "r2.bucket", value: body.bucket },
    { key: "r2.public_url", value: body.publicUrl.replace(/\/+$/, "") },
    { key: "r2.endpoint", value: body.endpoint ?? "" },
    { key: "r2.region", value: body.region || "auto" }
  ]);
  return await getR2Config(false);
}

export async function assertR2Ready(config?: R2Config): Promise<R2Config> {
  config ??= await getR2Config(true);
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucket || !config.publicUrl) {
    throw new Error("R2 配置不完整");
  }
  return config;
}

export async function testR2Connection(upload = false) {
  const config = await assertR2Ready();
  const client = createR2Client(config);
  const key = `chendoc-health/${Date.now()}-${randomUUID()}.txt`;
  const content = upload ? "chendoc-presigned-upload-ok" : "chendoc-r2-connection-ok";
  try {
    if (upload) {
      const origin = getR2CorsAllowedOrigins()[0]!;
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: "text/plain; charset=utf-8",
        ContentLength: Buffer.byteLength(content)
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 });
      const preflight = await fetch(uploadUrl, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type"
        },
        signal: AbortSignal.timeout(15_000)
      });
      const allowedOrigin = preflight.headers.get("access-control-allow-origin");
      const allowedMethods = preflight.headers.get("access-control-allow-methods") ?? "";
      const allowedHeaders = preflight.headers.get("access-control-allow-headers") ?? "";
      if (
        !preflight.ok
        || allowedOrigin !== origin
        || !allowedMethods.split(",").some((method) => method.trim().toUpperCase() === "PUT")
        || !allowedHeaders.split(",").some((header) => ["*", "content-type"].includes(header.trim().toLowerCase()))
      ) {
        throw new Error("R2 CORS 未允许本站使用 PUT 和 Content-Type");
      }
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Origin: origin,
          "Content-Type": "text/plain; charset=utf-8"
        },
        body: content,
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok || response.headers.get("access-control-allow-origin") !== origin) {
        throw new Error(`R2 浏览器直传失败（HTTP ${response.status}）`);
      }
    } else {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: content,
        ContentType: "text/plain; charset=utf-8"
      }));
    }
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const stored = await object.Body?.transformToString();
    if (head.ContentLength !== Buffer.byteLength(content) || stored !== content) {
      throw new Error("R2 测试对象校验失败");
    }
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })).catch(() => undefined);
  }
  return { ok: true, upload };
}
