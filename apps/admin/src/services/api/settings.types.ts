/**
 * services/api/settings.types.ts
 *
 * 设置相关类型定义
 */

export interface R2ConfigView {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
  endpoint: string;
  region: string;
}

export interface SiteConfigView {
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

export interface OperationLogView {
  id: number;
  userId?: number | null;
  username?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface ManagedUserDocView {
  docUid: string;
  title: string;
  status: "draft" | "published" | "archived";
  deletedAt?: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface ManagedUserView {
  id: number;
  username: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
  docCount: number;
  deletedDocCount: number;
  lastIp?: string | null;
  lastActiveAt?: string | null;
  recentIps: string[];
  docs?: ManagedUserDocView[];
}

export type SystemAction =
  | "cleanupExpiredSessions"
  | "cleanupExpiredCaptchas"
  | "emptyTrash"
  | "cleanupExpiredLogs"
  | "refreshStatus"
  | "healthCheck";

export interface SystemStatusView {
  version: string;
  generatedAt: string;
  service: {
    status: "running";
    label: string;
    uptimeSeconds: number;
    startedAt: string;
    memoryMb: number;
    nodeEnv: string;
    publicSiteUrl: string;
  };
  database: {
    status: "ok";
    label: string;
    provider: "sqlite" | "mysql";
    schemaVersion: string;
  };
  backup: null | { createdAt: string; fileName: string; size: number; sha256: string };
  storage: {
    fileCount: number;
    totalBytes: number;
    byKind: Record<"image" | "video" | "file", number>;
  };
  logs: {
    today: number;
    yesterday: number;
    delta: number;
    deltaPercent: number;
  };
  docs: {
    total: number;
    active: number;
    trash: number;
    published: number;
  };
  shares: {
    total: number;
    active: number;
    pendingReview: number;
    passwordProtected: number;
    totalViews: number;
  };
  security: {
    activeSessions: number;
    expiredSessions: number;
    activeCaptchas: number;
    staleCaptchas: number;
  };
  r2: {
    configured: boolean;
    bucket: string;
    publicUrl: string;
    endpoint: string;
    region: string;
    message: string;
  };
}

export interface SystemActionResult {
  action: SystemAction;
  changed: number;
  message: string;
  status?: SystemStatusView;
}

export interface SystemConfigExportView {
  version: string;
  exportedAt: string;
  site: SiteConfigView;
  r2: R2ConfigView;
  settings: Array<{ key: string; value: string; type: string; encrypted: boolean; updatedAt: string }>;
  overview: SystemStatusView;
}
