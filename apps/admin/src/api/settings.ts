import { request } from "./request";

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

export function getPublicSiteConfigApi() {
  return request<{ config: SiteConfigView }>("/api/public/settings/site");
}

export function getSiteConfigApi() {
  return request<{ config: SiteConfigView }>("/api/settings/site");
}

export function listOperationLogsApi() {
  return request<{ logs: OperationLogView[] }>("/api/settings/operation-logs");
}

export function saveSiteConfigApi(config: SiteConfigView) {
  return request<{ config: SiteConfigView }>("/api/settings/site", {
    method: "POST",
    body: JSON.stringify(config)
  });
}

export function getR2ConfigApi() {
  return request<{ config: R2ConfigView }>("/api/settings/storage/r2");
}

export function saveR2ConfigApi(config: R2ConfigView) {
  return request<{ config: R2ConfigView }>("/api/settings/storage/r2", {
    method: "POST",
    body: JSON.stringify(config)
  });
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
  return request<{ ok: true }>(`/api/admin/docs/by-id/${id}`, { method: "DELETE" });
}
