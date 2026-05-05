import { HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { settings } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { createR2Client } from "../../config/r2.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { maskSecret } from "../../utils/maskSecret.js";
import { now } from "../../utils/date.js";

const sensitiveKeys = new Set(["r2.access_key_id", "r2.secret_access_key"]);

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
  endpoint: string;
  region: string;
}

export interface SiteConfig {
  brandName: string;
  shortName: string;
  logoUrl: string;
  authWallpaperUrl: string;
  preferRemoteLogo: boolean;
  preferRemoteWallpaper: boolean;
  copyright: string;
}

const defaultRemoteLogoUrl = "https://cc.jy920.asia/chendoc-health/ChatGPT%20Image%202026%E5%B9%B44%E6%9C%8829%E6%97%A5%2019_47_58.png";
const defaultRemoteWallpaperUrl = "https://cc.jy920.asia/chendoc-health/4096x2714.jpg";

export const r2ConfigSchema = z.object({
  accountId: z.string().trim().min(1),
  accessKeyId: z.string().trim().optional(),
  secretAccessKey: z.string().trim().optional(),
  bucket: z.string().trim().min(1),
  publicUrl: z.string().trim().url(),
  endpoint: z.string().trim().url().optional().or(z.literal("")),
  region: z.string().trim().default("auto")
});

const siteConfigSchema = z.object({
  brandName: z.string().trim().min(1).max(80).default("陈书 / ChensDoc"),
  shortName: z.string().trim().min(1).max(24).default("陈书"),
  logoUrl: z.string().trim().url().or(z.literal("")).default(defaultRemoteLogoUrl),
  authWallpaperUrl: z.string().trim().url().or(z.literal("")).default(defaultRemoteWallpaperUrl),
  preferRemoteLogo: z.boolean().default(false),
  preferRemoteWallpaper: z.boolean().default(false),
  copyright: z.string().trim().max(120).default("Copyright © 2026 陈书. All rights reserved")
});

function settingValue(key: string, fallback = "") {
  const row = db.select().from(settings).where(eq(settings.key, key)).limit(1).get();
  if (!row) return fallback;
  if (row.encrypted) return decryptValue(row.value, env.configEncryptionKey);
  return row.value;
}

function settingBooleanValue(key: string, fallback = false) {
  const value = settingValue(key, fallback ? "true" : "false").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

export function setSetting(key: string, value: string, type: "string" | "json" | "number" | "boolean" = "string") {
  const createdAt = now();
  const encrypted = sensitiveKeys.has(key);
  const stored = encrypted ? encryptValue(value, env.configEncryptionKey) : value;
  const existing = db.select({ id: settings.id }).from(settings).where(eq(settings.key, key)).limit(1).get();
  if (existing) {
    db.update(settings).set({ value: stored, type, encrypted, updatedAt: createdAt }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value: stored, type, encrypted, createdAt, updatedAt: createdAt }).run();
  }
}

export function listSettings(mask = true) {
  return db.select().from(settings).all().map((row) => ({
    key: row.key,
    value: row.encrypted ? maskSecret(decryptValue(row.value, env.configEncryptionKey)) : row.value,
    type: row.type,
    encrypted: row.encrypted,
    updatedAt: row.updatedAt
  }));
}

export function getSiteConfig(): SiteConfig {
  return {
    brandName: settingValue("site.brand_name", "陈书 / ChensDoc"),
    shortName: settingValue("site.short_name", "陈书"),
    logoUrl: settingValue("site.logo_url", defaultRemoteLogoUrl),
    authWallpaperUrl: settingValue("site.auth_wallpaper_url", defaultRemoteWallpaperUrl),
    preferRemoteLogo: settingBooleanValue("site.prefer_remote_logo", false),
    preferRemoteWallpaper: settingBooleanValue("site.prefer_remote_wallpaper", false),
    copyright: settingValue("site.copyright", "Copyright © 2026 陈书. All rights reserved")
  };
}

export function saveSiteConfig(input: unknown) {
  const body = siteConfigSchema.parse(input);
  setSetting("site.brand_name", body.brandName);
  setSetting("site.short_name", body.shortName);
  setSetting("site.logo_url", body.logoUrl);
  setSetting("site.auth_wallpaper_url", body.authWallpaperUrl);
  setSetting("site.prefer_remote_logo", String(body.preferRemoteLogo), "boolean");
  setSetting("site.prefer_remote_wallpaper", String(body.preferRemoteWallpaper), "boolean");
  setSetting("site.copyright", body.copyright);
  return getSiteConfig();
}

export function getR2Config(revealSecrets = true): R2Config {
  const config = {
    accountId: settingValue("r2.account_id", env.r2.accountId),
    accessKeyId: settingValue("r2.access_key_id", env.r2.accessKeyId),
    secretAccessKey: settingValue("r2.secret_access_key", env.r2.secretAccessKey),
    bucket: settingValue("r2.bucket", env.r2.bucket),
    publicUrl: settingValue("r2.public_url", env.r2.publicUrl),
    endpoint: settingValue("r2.endpoint", env.r2.endpoint),
    region: settingValue("r2.region", env.r2.region || "auto")
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

export function saveR2Config(input: unknown) {
  const body = r2ConfigSchema.parse(input);
  const existing = getR2Config(true);
  setSetting("r2.account_id", body.accountId);
  if (body.accessKeyId) setSetting("r2.access_key_id", body.accessKeyId);
  else if (!existing.accessKeyId) throw new Error("R2 Access Key ID 不能为空");
  if (body.secretAccessKey) setSetting("r2.secret_access_key", body.secretAccessKey);
  else if (!existing.secretAccessKey) throw new Error("R2 Secret Access Key 不能为空");
  setSetting("r2.bucket", body.bucket);
  setSetting("r2.public_url", body.publicUrl.replace(/\/+$/, ""));
  setSetting("r2.endpoint", body.endpoint ?? "");
  setSetting("r2.region", body.region || "auto");
  return getR2Config(false);
}

export function assertR2Ready(config = getR2Config(true)) {
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucket || !config.publicUrl) {
    throw new Error("R2 配置不完整");
  }
  return config;
}

export async function testR2Connection(upload = false) {
  const config = assertR2Ready();
  const client = createR2Client(config);
  await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  if (upload) {
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: `chendoc-health/${Date.now()}.txt`,
      Body: "ok",
      ContentType: "text/plain; charset=utf-8"
    }));
  }
  return { ok: true, upload };
}
