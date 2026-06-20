import { HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq, gte, inArray, isNotNull, lt, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { db, dbAll, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { authSessions, captchas, docs, docVersions, invites, logs, operationLogs, settings, shares, spaces, uploads, users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { createR2Client } from "../../config/r2.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { maskSecret } from "../../utils/maskSecret.js";
import { now } from "../../utils/date.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";
import { clearLoginFailuresForUsername } from "../auth/loginRisk.service.js";
import { hashPassword, validatePassword } from "../../utils/password.js";

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
  recoveryContact: string;
  shareFooterText: string;
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

type SystemAction =
  | "cleanupExpiredSessions"
  | "cleanupExpiredCaptchas"
  | "cleanupExpiredLogs"
  | "emptyTrash"
  | "refreshStatus"
  | "healthCheck";

const defaultRemoteLogoUrl = "";
const defaultRemoteWallpaperUrl = "";
const APP_VERSION = "2.6.0";
const DATABASE_SCHEMA_VERSION = "20260620.1";
const REMOTE_ASSET_TIMEOUT_MS = 5000;
const REMOTE_LOGO_MAX_BYTES = 1024 * 1024;
const REMOTE_WALLPAPER_MAX_BYTES = 5 * 1024 * 1024;
const allowedRemoteAssetTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

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
  copyright: z.string().trim().max(120).default("Copyright © 2026 陈书. All rights reserved"),
  recoveryContact: z.string().trim().max(120).default("请联系管理员"),
  shareFooterText: z.string().trim().max(180).default("")
});

function safeRemoteAssetUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("远程资源地址不正确");
  }
  if (url.protocol !== "https:") throw new Error("远程资源必须使用 HTTPS");
  const host = url.hostname.toLowerCase();
  const allowedHosts = env.remoteAssetAllowedHosts;
  if (allowedHosts.length && !allowedHosts.includes(host)) {
    throw new Error("远程资源域名不在白名单中");
  }
  if (!allowedHosts.length) {
    throw new Error("未配置 CHENDOC_REMOTE_ASSET_HOSTS，不能启用远程资源");
  }
  return url.toString();
}

function publicRemoteAssetUrl(value: string) {
  if (!value.trim()) return "";
  try {
    return safeRemoteAssetUrl(value);
  } catch {
    return "";
  }
}

async function fetchRemoteAssetResponse(url: string, method: "HEAD" | "GET") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_ASSET_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined
    });
    if (response.body) await response.body.cancel().catch(() => undefined);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function contentLengthFromResponse(response: Response) {
  const rangeTotal = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
  const raw = rangeTotal || response.headers.get("content-length") || "";
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function validateRemoteAssetUrl(value: string, kind: "logo" | "wallpaper") {
  const url = safeRemoteAssetUrl(value);
  const maxBytes = kind === "logo" ? REMOTE_LOGO_MAX_BYTES : REMOTE_WALLPAPER_MAX_BYTES;
  const label = kind === "logo" ? "Logo" : "登录壁纸";
  let response: Response;

  try {
    response = await fetchRemoteAssetResponse(url, "HEAD");
    if (response.status === 405 || response.status === 501) {
      response = await fetchRemoteAssetResponse(url, "GET");
    }
  } catch {
    throw new Error(`${label} 远程资源无法访问`);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${label} 远程资源不允许重定向`);
  }
  if (!response.ok) {
    throw new Error(`${label} 远程资源无法访问`);
  }

  const contentType = (response.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
  if (!allowedRemoteAssetTypes.has(contentType)) {
    throw new Error(`${label} 远程资源 Content-Type 必须是受支持的图片类型`);
  }

  const contentLength = contentLengthFromResponse(response);
  if (contentLength === null) {
    throw new Error(`${label} 远程资源缺少可校验的文件大小`);
  }
  if (contentLength > maxBytes) {
    throw new Error(`${label} 远程资源文件过大`);
  }

  return url;
}

function decodeSettingRow(row: typeof settings.$inferSelect) {
  return row.encrypted ? decryptValue(row.value, env.configEncryptionKey) : row.value;
}

async function settingValue(key: string, fallback = "") {
  const row = await dbGet<typeof settings.$inferSelect>(db.select().from(settings).where(eq(settings.key, key)).limit(1));
  if (!row) return fallback;
  return decodeSettingRow(row);
}

async function settingBooleanValue(key: string, fallback = false) {
  const value = (await settingValue(key, fallback ? "true" : "false")).trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

async function settingValues(keys: string[]) {
  if (!keys.length) return new Map<string, string>();
  const rows = await dbAll<typeof settings.$inferSelect>(db.select().from(settings).where(inArray(settings.key, keys)));
  return new Map(rows.map((row) => [row.key, decodeSettingRow(row)]));
}

function valueFromSettings(values: Map<string, string>, key: string, fallback = "") {
  return values.get(key) ?? fallback;
}

function booleanFromSettings(values: Map<string, string>, key: string, fallback = false) {
  const value = valueFromSettings(values, key, fallback ? "true" : "false").trim().toLowerCase();
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
      id: logs.id,
      userId: logs.userId,
      username: users.username,
      action: logs.action,
      targetType: logs.targetType,
      targetId: logs.targetId,
      ip: logs.ip,
      userAgent: logs.userAgent,
      createdAt: logs.createdAt
    })
    .from(logs)
    .leftJoin(users, eq(logs.userId, users.id))
    .where(and(eq(logs.type, "operation_log"), ne(logs.action, "share.update")))
    .orderBy(desc(logs.createdAt), desc(logs.id))
    .limit(limit));
}

function startOfLocalDay(offsetDays = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

function percentDelta(today: number, yesterday: number) {
  if (!yesterday) return today ? 100 : 0;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

function systemMemoryMb() {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function r2ConfigStatus(config: R2Config | null, error?: string) {
  const configured = !!(
    config &&
    config.accountId &&
    config.accessKeyId &&
    config.secretAccessKey &&
    config.bucket &&
    config.publicUrl
  );
  return {
    configured,
    bucket: config?.bucket || "",
    publicUrl: config?.publicUrl || "",
    endpoint: config?.endpoint || "",
    region: config?.region || "auto",
    message: error || (configured ? "R2 配置完整" : "R2 配置未完整填写")
  };
}

async function safeR2Config() {
  try {
    return { config: await getR2Config(true), error: "" };
  } catch (error) {
    return {
      config: null,
      error: error instanceof Error ? error.message : "R2 配置读取失败"
    };
  }
}

function latestBackupStatus() {
  const directory = resolve(env.paths.projectRoot, process.env.CHENDOC_BACKUP_DIR || "backups/db");
  if (!existsSync(directory)) return null;
  const rows = readdirSync(directory)
    .filter((name) => name.endsWith(".gz.enc.json"))
    .flatMap((name) => {
      try {
        const value = JSON.parse(readFileSync(resolve(directory, name), "utf8")) as {
          createdAt?: string; fileName?: string; size?: number; sha256?: string;
        };
        return value.createdAt && value.fileName && value.sha256 ? [value] : [];
      } catch {
        return [];
      }
    })
    .sort((left, right) => Date.parse(right.createdAt!) - Date.parse(left.createdAt!));
  const latest = rows[0];
  return latest ? {
    createdAt: latest.createdAt!,
    fileName: latest.fileName!,
    size: Number(latest.size || 0),
    sha256: latest.sha256!
  } : null;
}

export async function getSystemOverview() {
  const todayStart = startOfLocalDay();
  const yesterdayStart = startOfLocalDay(-1);
  const processStartedAt = new Date(Date.now() - Math.floor(process.uptime() * 1000));
  const [
    docRows,
    uploadRows,
    shareRows,
    sessionRows,
    captchaRows,
    recentLogRows,
    r2Result
  ] = await Promise.all([
    dbAll<{ id: number; status: "draft" | "published" | "archived"; deletedAt: Date | null }>(db
      .select({ id: docs.id, status: docs.status, deletedAt: docs.deletedAt })
      .from(docs)),
    dbAll<{ id: number; kind: "image" | "video" | "file"; fileSize: number }>(db
      .select({ id: uploads.id, kind: uploads.kind, fileSize: uploads.fileSize })
      .from(uploads)),
    dbAll<{ id: number; isEnabled: boolean; reviewStatus: string; passwordHash: string | null; viewCount: number }>(db
      .select({
        id: shares.id,
        isEnabled: shares.isEnabled,
        reviewStatus: shares.reviewStatus,
        passwordHash: shares.passwordHash,
        viewCount: shares.viewCount
      })
      .from(shares)),
    dbAll<{ id: string; expireAt: Date }>(db
      .select({ id: authSessions.id, expireAt: authSessions.expireAt })
      .from(authSessions)),
    dbAll<{ id: string; expireAt: Date; usedAt: Date | null }>(db
      .select({ id: captchas.id, expireAt: captchas.expireAt, usedAt: captchas.usedAt })
      .from(captchas)),
    dbAll<{ id: number; createdAt: Date }>(db
      .select({ id: logs.id, createdAt: logs.createdAt })
      .from(logs)
      .where(gte(logs.createdAt, yesterdayStart))),
    safeR2Config()
  ]);

  const currentTime = Date.now();
  const todayLogs = recentLogRows.filter((row) => row.createdAt >= todayStart).length;
  const yesterdayLogs = recentLogRows.filter((row) => row.createdAt >= yesterdayStart && row.createdAt < todayStart).length;
  const storageBytes = uploadRows.reduce((total, row) => total + Number(row.fileSize || 0), 0);
  const uploadsByKind = uploadRows.reduce<Record<"image" | "video" | "file", number>>((current, row) => {
    current[row.kind] += 1;
    return current;
  }, { image: 0, video: 0, file: 0 });
  const docsInTrash = docRows.filter((doc) => !!doc.deletedAt).length;
  const activeSessions = sessionRows.filter((session) => session.expireAt.getTime() > currentTime).length;
  const expiredSessions = sessionRows.length - activeSessions;
  const activeCaptchas = captchaRows.filter((captcha) => !captcha.usedAt && captcha.expireAt.getTime() > currentTime).length;
  const staleCaptchas = captchaRows.length - activeCaptchas;
  const activeShares = shareRows.filter((share) => share.isEnabled).length;
  const pendingShares = shareRows.filter((share) => share.reviewStatus === "pending").length;
  const protectedShares = shareRows.filter((share) => !!share.passwordHash).length;
  const totalShareViews = shareRows.reduce((total, share) => total + Number(share.viewCount || 0), 0);

  return {
    version: `v${APP_VERSION}`,
    generatedAt: now(),
    service: {
      status: "running" as const,
      label: "运行中",
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: processStartedAt,
      memoryMb: systemMemoryMb(),
      nodeEnv: env.nodeEnv,
      publicSiteUrl: env.publicSiteUrl
    },
    database: {
      status: "ok" as const,
      label: "正常",
      provider: env.databaseProvider,
      schemaVersion: DATABASE_SCHEMA_VERSION
    },
    backup: latestBackupStatus(),
    storage: {
      fileCount: uploadRows.length,
      totalBytes: storageBytes,
      byKind: uploadsByKind
    },
    logs: {
      today: todayLogs,
      yesterday: yesterdayLogs,
      delta: todayLogs - yesterdayLogs,
      deltaPercent: percentDelta(todayLogs, yesterdayLogs)
    },
    docs: {
      total: docRows.length,
      active: docRows.length - docsInTrash,
      trash: docsInTrash,
      published: docRows.filter((doc) => doc.status === "published" && !doc.deletedAt).length
    },
    shares: {
      total: shareRows.length,
      active: activeShares,
      pendingReview: pendingShares,
      passwordProtected: protectedShares,
      totalViews: totalShareViews
    },
    security: {
      activeSessions,
      expiredSessions,
      activeCaptchas,
      staleCaptchas
    },
    r2: r2ConfigStatus(r2Result.config, r2Result.error)
  };
}

async function emptyTrashDocs() {
  const trashRows = await dbAll<{ id: number }>(db
    .select({ id: docs.id })
    .from(docs)
    .where(isNotNull(docs.deletedAt)));
  const trashIds = trashRows.map((row) => row.id);
  if (!trashIds.length) return 0;

  await dbTransaction(async (tx) => {
    await dbRun(tx.delete(shares).where(inArray(shares.docId, trashIds)));
    await dbRun(tx.delete(docVersions).where(inArray(docVersions.docId, trashIds)));
    await dbRun(tx.update(uploads).set({ docId: null }).where(inArray(uploads.docId, trashIds)));
    await dbRun(tx.delete(docs).where(inArray(docs.id, trashIds)));
  });

  return trashIds.length;
}

export async function runSystemMaintenanceAction(action: SystemAction) {
  const timestamp = now();
  if (action === "cleanupExpiredSessions") {
    const result = await dbRun(db.delete(authSessions).where(lte(authSessions.expireAt, timestamp)));
    return { action, changed: result.changes, message: `已清理 ${result.changes} 个过期登录会话` };
  }

  if (action === "cleanupExpiredCaptchas") {
    const result = await dbRun(db.delete(captchas).where(or(lte(captchas.expireAt, timestamp), isNotNull(captchas.usedAt))));
    return { action, changed: result.changes, message: `已清理 ${result.changes} 个过期或已使用验证码` };
  }

  if (action === "emptyTrash") {
    const changed = await emptyTrashDocs();
    return { action, changed, message: `已永久清理 ${changed} 篇回收站文档` };
  }

  if (action === "cleanupExpiredLogs") {
    const cutoff = new Date(Date.now() - env.logRetentionDays * 86_400_000);
    const [main, legacy] = await Promise.all([
      dbRun(db.delete(logs).where(lt(logs.createdAt, cutoff))),
      dbRun(db.delete(operationLogs).where(lt(operationLogs.createdAt, cutoff)))
    ]);
    return { action, changed: main.changes + legacy.changes, message: `已清理 ${main.changes + legacy.changes} 条过期日志` };
  }

  if (action === "refreshStatus") {
    return { action, changed: 0, message: "运行状态已刷新", status: await getSystemOverview() };
  }

  const status = await getSystemOverview();
  let r2Probe = { checked: false, ok: true, message: "R2 未配置，已跳过探测" };
  if (status.r2.configured) {
    try {
      await testR2Connection(false);
      r2Probe = { checked: true, ok: true, message: "R2 探测通过" };
    } catch (error) {
      r2Probe = { checked: true, ok: false, message: error instanceof Error ? error.message : "R2 探测失败" };
    }
  }
  return {
    action,
    changed: 0,
    message: r2Probe.ok ? "系统健康检测完成" : "系统健康检测完成，R2 探测失败",
    status,
    health: {
      database: { ok: true, provider: env.databaseProvider, schemaVersion: DATABASE_SCHEMA_VERSION },
      r2: r2Probe,
      buildVersion: APP_VERSION
    }
  };
}

export async function exportSystemConfig() {
  const [siteConfig, r2Config, settingsList, overview] = await Promise.all([
    getSiteConfig(),
    getR2Config(false),
    listSettings(true),
    getSystemOverview()
  ]);

  return {
    version: `v${APP_VERSION}`,
    exportedAt: now(),
    site: siteConfig,
    r2: r2Config,
    settings: settingsList,
    overview
  };
}

async function recentUserActivity(userId: number) {
  const rows = await dbAll<{ ip: string | null; createdAt: Date }>(db
    .select({
      ip: logs.ip,
      createdAt: logs.createdAt
    })
    .from(logs)
    .where(eq(logs.userId, userId))
    .orderBy(desc(logs.createdAt), desc(logs.id))
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
    .where(eq(docs.ownerId, userId)));
  return {
    docCount: rows.length,
    deletedDocCount: rows.filter((row) => !!row.deletedAt).length
  };
}

async function userDocStatsMap(userIds: number[]) {
  const stats = new Map<number, { docCount: number; deletedDocCount: number }>();
  for (const userId of userIds) stats.set(userId, { docCount: 0, deletedDocCount: 0 });
  if (!userIds.length) return stats;

  const rows = await dbAll<{ ownerId: number | null; deletedAt: Date | null }>(db
    .select({ ownerId: docs.ownerId, deletedAt: docs.deletedAt })
    .from(docs)
    .where(inArray(docs.ownerId, userIds)));

  for (const row of rows) {
    if (!row.ownerId) continue;
    const current = stats.get(row.ownerId) ?? { docCount: 0, deletedDocCount: 0 };
    current.docCount += 1;
    if (row.deletedAt) current.deletedDocCount += 1;
    stats.set(row.ownerId, current);
  }

  return stats;
}

async function recentUserActivityMap(userIds: number[]) {
  const activity = new Map<number, { lastIp: string | null; lastActiveAt: Date | null; recentIps: string[] }>();
  for (const userId of userIds) activity.set(userId, { lastIp: null, lastActiveAt: null, recentIps: [] });
  if (!userIds.length) return activity;

  const rows = await dbAll<{ userId: number | null; ip: string | null; createdAt: Date }>(db
    .select({
      userId: logs.userId,
      ip: logs.ip,
      createdAt: logs.createdAt
    })
    .from(logs)
    .where(inArray(logs.userId, userIds))
    .orderBy(desc(logs.createdAt), desc(logs.id))
    .limit(1000));

  for (const row of rows) {
    if (!row.userId) continue;
    const current = activity.get(row.userId) ?? { lastIp: null, lastActiveAt: null, recentIps: [] };
    if (!current.lastActiveAt) current.lastActiveAt = row.createdAt;
    if (row.ip && !current.recentIps.includes(row.ip) && current.recentIps.length < 8) current.recentIps.push(row.ip);
    current.lastIp = current.recentIps[0] ?? null;
    activity.set(row.userId, current);
  }

  return activity;
}

async function managedUserPayload(user: ManagedUser, includeDocs = false) {
  const docStats = await userDocStats(user.id);
  const activity = await recentUserActivity(user.id);
  const userDocs = includeDocs
    ? await dbAll(db
      .select({
        docUid: docs.docUid,
        title: docs.title,
        status: docs.status,
        deletedAt: docs.deletedAt,
        updatedAt: docs.updatedAt,
        createdAt: docs.createdAt
      })
      .from(docs)
      .where(eq(docs.ownerId, user.id))
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
  const userIds = rows.map((user) => user.id);
  const [docStats, activity] = await Promise.all([userDocStatsMap(userIds), recentUserActivityMap(userIds)]);
  return rows.map((user) => ({
    id: user.id,
    username: user.username,
    role: user.role,
    isSuperAdmin: isSuperAdminUser(user),
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(docStats.get(user.id) ?? { docCount: 0, deletedDocCount: 0 }),
    ...(activity.get(user.id) ?? { lastIp: null, lastActiveAt: null, recentIps: [] })
  }));
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
    await dbRun(tx.update(logs).set({ userId: null }).where(eq(logs.userId, id)));
    await dbRun(tx.update(docs).set({
      ownerId: null,
      ownerRole: "super_admin",
      scope: "system",
      isSuperAdminDoc: true,
      visibility: "private"
    }).where(eq(docs.ownerId, id)));
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

export async function getManagedUserPasswordView(id: number, actor: UserActor) {
  const user = await getManagedUserRecord(id);
  assertCanManageAdminUser(user, actor);
  return {
    viewable: false as const,
    message: "密码已加密存储，不能查看明文。请直接重置密码。"
  };
}

export async function resetManagedUserPassword(id: number, password: string, actor: UserActor) {
  const user = await getManagedUserRecord(id);
  assertCanManageAdminUser(user, actor);
  const validationMessage = validatePassword(password);
  if (validationMessage) throw new Error(validationMessage);
  const passwordHash = await hashPassword(password);
  await dbRun(db.update(users).set({ passwordHash, updatedAt: now() }).where(eq(users.id, id)));
  await clearLoginFailuresForUsername(user.username);
  await dbRun(db.delete(authSessions).where(eq(authSessions.userId, id)));
  return await getManagedUser(id);
}

export async function getSiteConfig(): Promise<SiteConfig> {
  const values = await settingValues([
    "site.brand_name",
    "site.short_name",
    "site.logo_url",
    "site.auth_wallpaper_url",
    "site.prefer_remote_logo",
    "site.prefer_remote_wallpaper",
    "site.copyright",
    "site.recovery_contact",
    "site.share_footer_text"
  ]);

  return {
    brandName: valueFromSettings(values, "site.brand_name", "陈书 / ChensDoc"),
    shortName: valueFromSettings(values, "site.short_name", "陈书"),
    logoUrl: publicRemoteAssetUrl(valueFromSettings(values, "site.logo_url", defaultRemoteLogoUrl)),
    authWallpaperUrl: publicRemoteAssetUrl(valueFromSettings(values, "site.auth_wallpaper_url", defaultRemoteWallpaperUrl)),
    preferRemoteLogo: booleanFromSettings(values, "site.prefer_remote_logo", false) && !!publicRemoteAssetUrl(valueFromSettings(values, "site.logo_url", defaultRemoteLogoUrl)),
    preferRemoteWallpaper: booleanFromSettings(values, "site.prefer_remote_wallpaper", false) && !!publicRemoteAssetUrl(valueFromSettings(values, "site.auth_wallpaper_url", defaultRemoteWallpaperUrl)),
    copyright: valueFromSettings(values, "site.copyright", "Copyright © 2026 陈书. All rights reserved"),
    recoveryContact: valueFromSettings(values, "site.recovery_contact", "请联系管理员"),
    shareFooterText: valueFromSettings(values, "site.share_footer_text", "")
  };
}

export async function saveSiteConfig(input: unknown) {
  const body = siteConfigSchema.parse(input);
  const logoUrl = body.logoUrl ? await validateRemoteAssetUrl(body.logoUrl, "logo") : "";
  const wallpaperUrl = body.authWallpaperUrl ? await validateRemoteAssetUrl(body.authWallpaperUrl, "wallpaper") : "";
  await setSetting("site.brand_name", body.brandName);
  await setSetting("site.short_name", body.shortName);
  await setSetting("site.logo_url", logoUrl);
  await setSetting("site.auth_wallpaper_url", wallpaperUrl);
  await setSetting("site.prefer_remote_logo", String(body.preferRemoteLogo && !!logoUrl), "boolean");
  await setSetting("site.prefer_remote_wallpaper", String(body.preferRemoteWallpaper && !!wallpaperUrl), "boolean");
  await setSetting("site.copyright", body.copyright);
  await setSetting("site.recovery_contact", body.recoveryContact);
  await setSetting("site.share_footer_text", body.shareFooterText);
  return await getSiteConfig();
}

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
