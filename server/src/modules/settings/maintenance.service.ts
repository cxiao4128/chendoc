// Maintenance service - system overview and maintenance actions

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbTransaction } from "../../db/client.js";
import {
  getCaptchaStats,
  getDocStats,
  getLogStats,
  getSessionStats,
  getShareStats,
  getTrashDocIds,
  getUploadStats,
  emptyTrashDocs as emptyTrashDocsFromRepo,
  cleanupExpiredSessions,
  cleanupExpiredCaptchas,
  cleanupExpiredLogs,
} from "./maintenance.repo.js";
import { env } from "../../config/env.js";
import { now } from "../../utils/date.js";
import { testR2Connection } from "./storage.service.js";
import type { SystemAction, UserActor } from "./types.js";
import { getSiteConfig } from "./site.service.js";
import { getR2Config } from "./storage.service.js";
import { listSettings } from "./core.service.js";

const APP_VERSION = "3.3.1";
const DATABASE_SCHEMA_VERSION = "20260620.1";

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

function r2ConfigStatus(config: { bucket?: string; publicUrl?: string; endpoint?: string; region?: string } | null, error?: string) {
  const configured = !!(
    config &&
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
  const timestamp = now();
  const [docStats, uploadStats, shareStats, sessionStats, captchaStats, logStats, r2Result] = await Promise.all([
    getDocStats(),
    getUploadStats(),
    getShareStats(),
    getSessionStats(timestamp),
    getCaptchaStats(timestamp),
    getLogStats(todayStart, yesterdayStart),
    safeR2Config()
  ]);

  const totalDocs = Number(docStats?.total ?? 0);
  const docsInTrash = Number(docStats?.trash ?? 0);
  const totalUploads = Number(uploadStats?.total ?? 0);
  const storageBytes = Number(uploadStats?.bytes ?? 0);
  const uploadsByKind = {
    image: Number(uploadStats?.images ?? 0),
    video: Number(uploadStats?.videos ?? 0),
    file: Number(uploadStats?.files ?? 0)
  };
  const activeSessions = Number(sessionStats?.active ?? 0);
  const expiredSessions = Number(sessionStats?.total ?? 0) - activeSessions;
  const activeCaptchas = Number(captchaStats?.active ?? 0);
  const staleCaptchas = Number(captchaStats?.total ?? 0) - activeCaptchas;
  const todayLogs = Number(logStats?.today ?? 0);
  const yesterdayLogs = Number(logStats?.yesterday ?? 0);

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
      fileCount: totalUploads,
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
      total: totalDocs,
      active: totalDocs - docsInTrash,
      trash: docsInTrash,
      published: Number(docStats?.published ?? 0)
    },
    shares: {
      total: Number(shareStats?.total ?? 0),
      active: Number(shareStats?.active ?? 0),
      pendingReview: Number(shareStats?.pending ?? 0),
      passwordProtected: Number(shareStats?.protected ?? 0),
      totalViews: Number(shareStats?.views ?? 0)
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

async function emptyTrashDocs(_actor: UserActor) {
  const trashRows = await getTrashDocIds();
  const trashIds = trashRows.map((row) => row.id);
  if (!trashIds.length) return 0;
  await dbTransaction(async (tx) => {
    await emptyTrashDocsFromRepo(tx, trashIds);
  });
  return trashIds.length;
}

export async function runSystemMaintenanceAction(action: SystemAction, actor: UserActor) {
  const timestamp = now();
  if (action === "cleanupExpiredSessions") {
    const result = await cleanupExpiredSessions(timestamp);
    return { action, changed: result.changes, message: `已清理 ${result.changes} 个过期登录会话` };
  }

  if (action === "cleanupExpiredCaptchas") {
    const result = await cleanupExpiredCaptchas(timestamp);
    return { action, changed: result.changes, message: `已清理 ${result.changes} 个过期或已使用验证码` };
  }

  if (action === "emptyTrash") {
    if (!actor.isSuperAdmin) throw new Error("只有超级管理员可以清空全站回收站");
    const changed = await emptyTrashDocs(actor);
    return { action, changed, message: `已永久清理 ${changed} 篇回收站文档` };
  }

  if (action === "cleanupExpiredLogs") {
    const cutoff = new Date(Date.now() - env.logRetentionDays * 86_400_000);
    const { mainChanges, legacyChanges } = await cleanupExpiredLogs(cutoff);
    return { action, changed: mainChanges + legacyChanges, message: `已清理 ${mainChanges + legacyChanges} 条过期日志` };
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
