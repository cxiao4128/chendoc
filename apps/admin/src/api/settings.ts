import { request } from "./request";
import { ensureDangerVerified } from "./security";

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
  id: number;
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
  };
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

export function getPublicSiteConfigApi() {
  return request<{ config: SiteConfigView }>("/api/public/settings/site");
}

export function getSiteConfigApi() {
  return request<{ config: SiteConfigView }>("/api/settings/site");
}

export function listOperationLogsApi() {
  return request<{ logs: OperationLogView[] }>("/api/settings/operation-logs");
}

export function getSystemStatusApi() {
  return request<{ status: SystemStatusView }>("/api/settings/system/status");
}

export function runSystemActionApi(action: SystemAction) {
  return ensureDangerVerified().then(() => request<{ result: SystemActionResult }>(`/api/settings/system/actions/${action}`, { method: "POST" }));
}

export function exportSystemConfigApi() {
  return ensureDangerVerified().then(() => request<{ export: SystemConfigExportView }>("/api/settings/system/export"));
}

export function listManagedUsersApi() {
  return request<{ users: ManagedUserView[] }>("/api/admin/users");
}

export function getManagedUserApi(id: number) {
  return request<{ user: ManagedUserView }>(`/api/admin/users/${id}`);
}

export function promoteManagedUserApi(id: number) {
  return ensureDangerVerified().then(() => request<{ user: ManagedUserView }>(`/api/admin/users/${id}/promote`, { method: "POST" }));
}

export function disableManagedUserApi(id: number) {
  return ensureDangerVerified().then(() => request<{ user: ManagedUserView }>(`/api/admin/users/${id}/disable`, { method: "POST" }));
}

export function enableManagedUserApi(id: number) {
  return request<{ user: ManagedUserView }>(`/api/admin/users/${id}/enable`, { method: "POST" });
}

export function deleteManagedUserApi(id: number) {
  return ensureDangerVerified().then(() => request<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" }));
}

export function getManagedUserPasswordApi(id: number) {
  return request<{ password: { viewable: false; message: string } }>(`/api/admin/users/${id}/password`);
}

export function resetManagedUserPasswordApi(id: number, password: string) {
  return request<{ user: ManagedUserView }>(`/api/admin/users/${id}/password`, {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export function saveSiteConfigApi(config: SiteConfigView) {
  return ensureDangerVerified().then(() => request<{ config: SiteConfigView }>("/api/settings/site", {
    method: "POST",
    body: JSON.stringify(config)
  }));
}

export function getR2ConfigApi() {
  return request<{ config: R2ConfigView }>("/api/settings/storage/r2");
}

export function saveR2ConfigApi(config: R2ConfigView) {
  return ensureDangerVerified().then(() => request<{ config: R2ConfigView }>("/api/settings/storage/r2", {
    method: "POST",
    body: JSON.stringify(config)
  }));
}

export function testR2Api(upload: boolean) {
  return request<{ ok: boolean; upload: boolean }>("/api/settings/storage/r2/test", {
    method: "POST",
    body: JSON.stringify({ upload })
  });
}

export function getDangerDocApi(id: number) {
  return request<{ doc: { id: number; title: string; createdAt: string; updatedAt: string; shareCode?: number | null; deletedAt?: string | null } }>(`/api/admin/docs/by-id/${id}`);
}

export function dangerDeleteDocApi(id: number) {
  return ensureDangerVerified().then(() => request<{ ok: true }>(`/api/admin/docs/by-id/${id}`, { method: "DELETE" }));
}
