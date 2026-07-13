/**
 * services/api/settings.api_core.ts
 *
 * 设置 API 函数实现 - 直接调用 HTTP 层
 */

import { request } from "@/api/request";
import { ensureDangerVerified } from "@/api/security";
import type {
  R2ConfigView,
  SiteConfigView,
  OperationLogView,
  ManagedUserView,
  SystemAction,
  SystemStatusView,
  SystemActionResult,
  SystemConfigExportView
} from "./settings.types";

// ============= 站点配置 =============

export function getPublicSiteConfigApi() {
  return request<{ config: SiteConfigView }>("/api/public/settings/site");
}

export function getSiteConfigApi() {
  return request<{ config: SiteConfigView }>("/api/settings/site");
}

export async function saveSiteConfigApi(config: SiteConfigView) {
  await ensureDangerVerified();
  return request<{ config: SiteConfigView }>("/api/settings/site", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

// ============= 存储配置 =============

export function getR2ConfigApi() {
  return request<{ config: R2ConfigView }>("/api/settings/storage/r2");
}

export async function saveR2ConfigApi(config: R2ConfigView) {
  await ensureDangerVerified();
  return request<{ config: R2ConfigView }>("/api/settings/storage/r2", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export function testR2Api(upload: boolean) {
  return request<{ ok: boolean; upload: boolean }>("/api/settings/storage/r2/test", {
    method: "POST",
    body: JSON.stringify({ upload }),
  });
}

// ============= 操作日志 =============

export function listOperationLogsApi() {
  return request<{ logs: OperationLogView[] }>("/api/settings/operation-logs");
}

// ============= 系统状态 =============

export function getSystemStatusApi() {
  return request<{ status: SystemStatusView }>("/api/settings/system/status");
}

export async function runSystemActionApi(action: SystemAction) {
  await ensureDangerVerified();
  return request<{ result: SystemActionResult }>(`/api/settings/system/actions/${action}`, {
    method: "POST",
  });
}

export async function exportSystemConfigApi() {
  await ensureDangerVerified();
  return request<{ export: SystemConfigExportView }>("/api/settings/system/export");
}

// ============= 用户管理 =============

export function listManagedUsersApi() {
  return request<{ users: ManagedUserView[] }>("/api/admin/users");
}

export function getManagedUserApi(id: number) {
  return request<{ user: ManagedUserView }>(`/api/admin/users/${id}`);
}

export async function promoteManagedUserApi(id: number) {
  await ensureDangerVerified();
  return request<{ user: ManagedUserView }>(`/api/admin/users/${id}/promote`, { method: "POST" });
}

export async function disableManagedUserApi(id: number) {
  await ensureDangerVerified();
  return request<{ user: ManagedUserView }>(`/api/admin/users/${id}/disable`, { method: "POST" });
}

export async function enableManagedUserApi(id: number) {
  await ensureDangerVerified();
  return request<{ user: ManagedUserView }>(`/api/admin/users/${id}/enable`, { method: "POST" });
}

export async function deleteManagedUserApi(id: number) {
  await ensureDangerVerified();
  return request<{ ok: true }>(`/api/admin/users/${id}`, { method: "DELETE" });
}

export async function getManagedUserPasswordApi(id: number) {
  await ensureDangerVerified();
  return request<{ password: { viewable: false; message: string } }>(`/api/admin/users/${id}/password`);
}

export async function resetManagedUserPasswordApi(id: number, password: string) {
  await ensureDangerVerified();
  return request<{ user: ManagedUserView }>(`/api/admin/users/${id}/password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

// ============= 统一 API 对象 =============

export const settingsApi = {
  publicSite: getPublicSiteConfigApi,
  site: getSiteConfigApi,
  saveSite: saveSiteConfigApi,
  r2: getR2ConfigApi,
  saveR2: saveR2ConfigApi,
  testR2: testR2Api,
  logs: listOperationLogsApi,
  status: getSystemStatusApi,
  runAction: runSystemActionApi,
  exportConfig: exportSystemConfigApi,
  users: listManagedUsersApi,
  getUser: getManagedUserApi,
  promoteUser: promoteManagedUserApi,
  disableUser: disableManagedUserApi,
  enableUser: enableManagedUserApi,
  deleteUser: deleteManagedUserApi,
  getUserPassword: getManagedUserPasswordApi,
  resetUserPassword: resetManagedUserPasswordApi,
};

// ============= 危险操作 API =============

export interface DangerDocView {
  docUid: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  shareCode?: number | null;
  customSlug?: string | null;
  deletedAt?: string | null;
}

export async function getDangerDocApi(docUid: string) {
  return request<{ doc: DangerDocView }>(`/api/admin/docs/by-uid/${docUid}`);
}

export async function dangerDeleteDocApi(docUid: string) {
  await ensureDangerVerified();
  return request<{ ok: true }>(`/api/admin/docs/by-uid/${docUid}`, { method: "DELETE" });
}
