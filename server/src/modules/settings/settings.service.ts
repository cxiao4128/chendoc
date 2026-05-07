import { HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { authSessions, docs, docVersions, invites, operationLogs, settings, shares, spaces, uploads, users } from "../../db/schema.js";
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

type ManagedUser = {
  id: number;
  username: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
};

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

export function listOperationLogs(limit = 80) {
  return db
    .select({
      id: operationLogs.id,
      userId: operationLogs.userId,
      username: users.username,
      action: operationLogs.action,
      targetType: operationLogs.targetType,
      targetId: operationLogs.targetId,
      ip: operationLogs.ip,
      userAgent: operationLogs.userAgent,
      createdAt: operationLogs.createdAt
    })
    .from(operationLogs)
    .leftJoin(users, eq(operationLogs.userId, users.id))
    .orderBy(desc(operationLogs.createdAt), desc(operationLogs.id))
    .limit(limit)
    .all();
}

function recentUserActivity(userId: number) {
  const rows = db
    .select({
      ip: operationLogs.ip,
      createdAt: operationLogs.createdAt
    })
    .from(operationLogs)
    .where(eq(operationLogs.userId, userId))
    .orderBy(desc(operationLogs.createdAt), desc(operationLogs.id))
    .limit(80)
    .all();
  const recentIps = Array.from(new Set(rows.map((row) => row.ip).filter((ip): ip is string => !!ip))).slice(0, 8);
  return {
    lastIp: recentIps[0] ?? null,
    lastActiveAt: rows[0]?.createdAt ?? null,
    recentIps
  };
}

function userDocStats(userId: number) {
  const rows = db
    .select({ deletedAt: docs.deletedAt })
    .from(docs)
    .where(eq(docs.createdBy, userId))
    .all();
  return {
    docCount: rows.length,
    deletedDocCount: rows.filter((row) => !!row.deletedAt).length
  };
}

function managedUserPayload(user: ManagedUser, includeDocs = false) {
  const docStats = userDocStats(user.id);
  const activity = recentUserActivity(user.id);
  const userDocs = includeDocs
    ? db
      .select({
        id: docs.id,
        title: docs.title,
        status: docs.status,
        deletedAt: docs.deletedAt,
        updatedAt: docs.updatedAt,
        createdAt: docs.createdAt
      })
      .from(docs)
      .where(eq(docs.createdBy, user.id))
      .orderBy(desc(docs.updatedAt), desc(docs.id))
      .limit(80)
      .all()
    : undefined;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...docStats,
    ...activity,
    ...(userDocs ? { docs: userDocs } : {})
  };
}

function getManagedUserRecord(id: number) {
  const user = db.select().from(users).where(eq(users.id, id)).limit(1).get();
  if (!user) throw new Error("用户不存在");
  return user;
}

function activeAdminCount() {
  return db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active")))
    .all().length;
}

function assertCanDisableOrDeleteUser(target: ManagedUser, actorId: number) {
  if (target.id === actorId) throw new Error("不能操作当前登录账号");
  if (target.role === "admin" && target.status === "active" && activeAdminCount() <= 1) {
    throw new Error("至少保留一个启用的超级管理员");
  }
}

export function listManagedUsers() {
  return db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    })
    .from(users)
    .orderBy(desc(users.createdAt), desc(users.id))
    .all()
    .map((user) => managedUserPayload(user));
}

export function getManagedUser(id: number) {
  return managedUserPayload(getManagedUserRecord(id), true);
}

export function promoteManagedUser(id: number) {
  const updatedAt = now();
  db.update(users).set({ role: "admin", status: "active", updatedAt }).where(eq(users.id, id)).run();
  db.delete(authSessions).where(eq(authSessions.userId, id)).run();
  return getManagedUser(id);
}

export function disableManagedUser(id: number, actorId: number) {
  const user = getManagedUserRecord(id);
  assertCanDisableOrDeleteUser(user, actorId);
  db.update(users).set({ status: "disabled", updatedAt: now() }).where(eq(users.id, id)).run();
  db.delete(authSessions).where(eq(authSessions.userId, id)).run();
  return getManagedUser(id);
}

export function enableManagedUser(id: number) {
  db.update(users).set({ status: "active", updatedAt: now() }).where(eq(users.id, id)).run();
  return getManagedUser(id);
}

export function deleteManagedUser(id: number, actorId: number) {
  const user = getManagedUserRecord(id);
  assertCanDisableOrDeleteUser(user, actorId);
  db.transaction((tx) => {
    tx.delete(authSessions).where(eq(authSessions.userId, id)).run();
    tx.update(operationLogs).set({ userId: null }).where(eq(operationLogs.userId, id)).run();
    tx.update(docs).set({ createdBy: null }).where(eq(docs.createdBy, id)).run();
    tx.update(docs).set({ updatedBy: null }).where(eq(docs.updatedBy, id)).run();
    tx.update(invites).set({ createdBy: null }).where(eq(invites.createdBy, id)).run();
    tx.update(invites).set({ usedBy: null }).where(eq(invites.usedBy, id)).run();
    tx.update(spaces).set({ ownerId: null }).where(eq(spaces.ownerId, id)).run();
    tx.update(shares).set({ requestedBy: null }).where(eq(shares.requestedBy, id)).run();
    tx.update(shares).set({ reviewedBy: null }).where(eq(shares.reviewedBy, id)).run();
    tx.update(uploads).set({ userId: null }).where(eq(uploads.userId, id)).run();
    tx.update(docVersions).set({ createdBy: null }).where(eq(docVersions.createdBy, id)).run();
    tx.delete(users).where(eq(users.id, id)).run();
  });
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
