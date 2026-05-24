import { HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, dbAll, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { authSessions, docs, docVersions, invites, operationLogs, settings, shares, spaces, uploads, users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { createR2Client } from "../../config/r2.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { maskSecret } from "../../utils/maskSecret.js";
import { now } from "../../utils/date.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";

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

type UserActor = {
  id: number;
  username: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
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

async function settingValue(key: string, fallback = "") {
  const row = await dbGet<typeof settings.$inferSelect>(db.select().from(settings).where(eq(settings.key, key)).limit(1));
  if (!row) return fallback;
  if (row.encrypted) return decryptValue(row.value, env.configEncryptionKey);
  return row.value;
}

async function settingBooleanValue(key: string, fallback = false) {
  const value = (await settingValue(key, fallback ? "true" : "false")).trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

export async function setSetting(key: string, value: string, type: "string" | "json" | "number" | "boolean" = "string") {
  const createdAt = now();
  const encrypted = sensitiveKeys.has(key);
  const stored = encrypted ? encryptValue(value, env.configEncryptionKey) : value;
  const existing = await dbGet<{ id: number }>(db.select({ id: settings.id }).from(settings).where(eq(settings.key, key)).limit(1));
  if (existing) {
    await dbRun(db.update(settings).set({ value: stored, type, encrypted, updatedAt: createdAt }).where(eq(settings.key, key)));
  } else {
    await dbRun(db.insert(settings).values({ key, value: stored, type, encrypted, createdAt, updatedAt: createdAt }));
  }
}

export async function listSettings(mask = true) {
  return (await dbAll<typeof settings.$inferSelect>(db.select().from(settings))).map((row) => ({
    key: row.key,
    value: row.encrypted ? maskSecret(decryptValue(row.value, env.configEncryptionKey)) : row.value,
    type: row.type,
    encrypted: row.encrypted,
    updatedAt: row.updatedAt
  }));
}

export async function listOperationLogs(limit = 80) {
  return await dbAll(db
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
    .where(ne(operationLogs.action, "share.update"))
    .orderBy(desc(operationLogs.createdAt), desc(operationLogs.id))
    .limit(limit));
}

async function recentUserActivity(userId: number) {
  const rows = await dbAll<{ ip: string | null; createdAt: Date }>(db
    .select({
      ip: operationLogs.ip,
      createdAt: operationLogs.createdAt
    })
    .from(operationLogs)
    .where(eq(operationLogs.userId, userId))
    .orderBy(desc(operationLogs.createdAt), desc(operationLogs.id))
    .limit(80));
  const recentIps = Array.from(new Set(rows.map((row) => row.ip).filter((ip): ip is string => !!ip))).slice(0, 8);
  return {
    lastIp: recentIps[0] ?? null,
    lastActiveAt: rows[0]?.createdAt ?? null,
    recentIps
  };
}

async function userDocStats(userId: number) {
  const rows = await dbAll<{ deletedAt: Date | null }>(db
    .select({ deletedAt: docs.deletedAt })
    .from(docs)
    .where(eq(docs.createdBy, userId)));
  return {
    docCount: rows.length,
    deletedDocCount: rows.filter((row) => !!row.deletedAt).length
  };
}

async function managedUserPayload(user: ManagedUser, includeDocs = false) {
  const docStats = await userDocStats(user.id);
  const activity = await recentUserActivity(user.id);
  const userDocs = includeDocs
    ? await dbAll(db
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
      .limit(80))
    : undefined;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isSuperAdmin: isSuperAdminUser(user),
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...docStats,
    ...activity,
    ...(userDocs ? { docs: userDocs } : {})
  };
}

async function getManagedUserRecord(id: number) {
  const user = await dbGet<ManagedUser>(db.select().from(users).where(eq(users.id, id)).limit(1));
  if (!user) throw new Error("用户不存在");
  return user;
}

async function activeAdminCount() {
  const rows = await dbAll(db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active"))));
  return rows.length;
}

function assertCanManageAdminUser(target: ManagedUser, actor: UserActor) {
  if (target.role === "admin" && !actor.isSuperAdmin) {
    throw new Error("只有超级管理员可以操作管理员账号");
  }
}

function assertCanPromoteUser(target: ManagedUser, actor: UserActor) {
  if (!actor.isSuperAdmin) throw new Error("只有超级管理员可以提级用户");
  if (target.role === "admin") throw new Error("该用户已经是管理员");
}

async function assertCanDisableOrDeleteUser(target: ManagedUser, actor: UserActor) {
  if (target.id === actor.id) throw new Error("不能操作当前登录账号");
  assertCanManageAdminUser(target, actor);
  if (target.role === "admin" && target.status === "active" && await activeAdminCount() <= 1) {
    throw new Error("至少保留一个启用的管理员");
  }
}

export async function listManagedUsers() {
  const rows = await dbAll<ManagedUser>(db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    })
    .from(users)
    .orderBy(desc(users.createdAt), desc(users.id)));
  return await Promise.all(rows.map((user) => managedUserPayload(user)));
}

export async function getManagedUser(id: number) {
  return await managedUserPayload(await getManagedUserRecord(id), true);
}

export async function promoteManagedUser(id: number, actor: UserActor) {
  const user = await getManagedUserRecord(id);
  assertCanPromoteUser(user, actor);
  const updatedAt = now();
  await dbRun(db.update(users).set({ role: "admin", status: "active", updatedAt }).where(eq(users.id, id)));
  await dbRun(db.delete(authSessions).where(eq(authSessions.userId, id)));
  return await getManagedUser(id);
}

export async function disableManagedUser(id: number, actor: UserActor) {
  const user = await getManagedUserRecord(id);
  await assertCanDisableOrDeleteUser(user, actor);
  await dbRun(db.update(users).set({ status: "disabled", updatedAt: now() }).where(eq(users.id, id)));
  await dbRun(db.delete(authSessions).where(eq(authSessions.userId, id)));
  return await getManagedUser(id);
}

export async function enableManagedUser(id: number, actor: UserActor) {
  const user = await getManagedUserRecord(id);
  assertCanManageAdminUser(user, actor);
  await dbRun(db.update(users).set({ status: "active", updatedAt: now() }).where(eq(users.id, id)));
  return await getManagedUser(id);
}

export async function deleteManagedUser(id: number, actor: UserActor) {
  const user = await getManagedUserRecord(id);
  await assertCanDisableOrDeleteUser(user, actor);
  await dbTransaction(async (tx) => {
    await dbRun(tx.delete(authSessions).where(eq(authSessions.userId, id)));
    await dbRun(tx.update(operationLogs).set({ userId: null }).where(eq(operationLogs.userId, id)));
    await dbRun(tx.update(docs).set({ createdBy: null }).where(eq(docs.createdBy, id)));
    await dbRun(tx.update(docs).set({ updatedBy: null }).where(eq(docs.updatedBy, id)));
    await dbRun(tx.update(invites).set({ createdBy: null }).where(eq(invites.createdBy, id)));
    await dbRun(tx.update(invites).set({ usedBy: null }).where(eq(invites.usedBy, id)));
    await dbRun(tx.update(spaces).set({ ownerId: null }).where(eq(spaces.ownerId, id)));
    await dbRun(tx.update(shares).set({ requestedBy: null }).where(eq(shares.requestedBy, id)));
    await dbRun(tx.update(shares).set({ reviewedBy: null }).where(eq(shares.reviewedBy, id)));
    await dbRun(tx.update(uploads).set({ userId: null }).where(eq(uploads.userId, id)));
    await dbRun(tx.update(docVersions).set({ createdBy: null }).where(eq(docVersions.createdBy, id)));
    await dbRun(tx.delete(users).where(eq(users.id, id)));
  });
}

export async function getSiteConfig(): Promise<SiteConfig> {
  return {
    brandName: await settingValue("site.brand_name", "陈书 / ChensDoc"),
    shortName: await settingValue("site.short_name", "陈书"),
    logoUrl: await settingValue("site.logo_url", defaultRemoteLogoUrl),
    authWallpaperUrl: await settingValue("site.auth_wallpaper_url", defaultRemoteWallpaperUrl),
    preferRemoteLogo: await settingBooleanValue("site.prefer_remote_logo", false),
    preferRemoteWallpaper: await settingBooleanValue("site.prefer_remote_wallpaper", false),
    copyright: await settingValue("site.copyright", "Copyright © 2026 陈书. All rights reserved")
  };
}

export async function saveSiteConfig(input: unknown) {
  const body = siteConfigSchema.parse(input);
  await setSetting("site.brand_name", body.brandName);
  await setSetting("site.short_name", body.shortName);
  await setSetting("site.logo_url", body.logoUrl);
  await setSetting("site.auth_wallpaper_url", body.authWallpaperUrl);
  await setSetting("site.prefer_remote_logo", String(body.preferRemoteLogo), "boolean");
  await setSetting("site.prefer_remote_wallpaper", String(body.preferRemoteWallpaper), "boolean");
  await setSetting("site.copyright", body.copyright);
  return await getSiteConfig();
}

export async function getR2Config(revealSecrets = true): Promise<R2Config> {
  const config = {
    accountId: await settingValue("r2.account_id", env.r2.accountId),
    accessKeyId: await settingValue("r2.access_key_id", env.r2.accessKeyId),
    secretAccessKey: await settingValue("r2.secret_access_key", env.r2.secretAccessKey),
    bucket: await settingValue("r2.bucket", env.r2.bucket),
    publicUrl: await settingValue("r2.public_url", env.r2.publicUrl),
    endpoint: await settingValue("r2.endpoint", env.r2.endpoint),
    region: await settingValue("r2.region", env.r2.region || "auto")
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

export async function saveR2Config(input: unknown) {
  const body = r2ConfigSchema.parse(input);
  const existing = await getR2Config(true);
  await setSetting("r2.account_id", body.accountId);
  if (body.accessKeyId) await setSetting("r2.access_key_id", body.accessKeyId);
  else if (!existing.accessKeyId) throw new Error("R2 Access Key ID 不能为空");
  if (body.secretAccessKey) await setSetting("r2.secret_access_key", body.secretAccessKey);
  else if (!existing.secretAccessKey) throw new Error("R2 Secret Access Key 不能为空");
  await setSetting("r2.bucket", body.bucket);
  await setSetting("r2.public_url", body.publicUrl.replace(/\/+$/, ""));
  await setSetting("r2.endpoint", body.endpoint ?? "");
  await setSetting("r2.region", body.region || "auto");
  return await getR2Config(false);
}

export async function assertR2Ready(config?: R2Config) {
  config ??= await getR2Config(true);
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucket || !config.publicUrl) {
    throw new Error("R2 配置不完整");
  }
  return config;
}

export async function testR2Connection(upload = false) {
  const config = await assertR2Ready();
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
