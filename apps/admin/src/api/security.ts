import { request } from "./request";
import { nativeFormDialog } from "../services/nativeDialog";

let dangerVerifiedUntil = 0;

export interface TotpStatusView {
  enabled: boolean;
  recoveryCodesRemaining: number;
  updatedAt?: string | null;
}

export interface TotpSetupView {
  secret: string;
  otpauthUrl: string;
  expireAt: number;
  setupToken: string;
}

async function promptDangerPayload() {
  const values = await nativeFormDialog({
    title: "管理员二次验证",
    message: "危险操作需要再次确认身份。5 分钟内不会重复要求。",
    confirmText: "验证",
    fields: [
      {
        key: "password",
        label: "管理员密码",
        type: "password",
        autocomplete: "current-password",
        required: true,
        autofocus: true
      },
      {
        key: "otp",
        label: "OTP 或恢复码",
        type: "text",
        autocomplete: "one-time-code",
        placeholder: "未开启 TOTP 可留空"
      }
    ]
  });
  const password = values?.password?.trim();
  if (!password) throw new Error("已取消二次验证");
  const otp = values?.otp || "";
  return { password, otp: otp.trim() || undefined };
}

export async function ensureDangerVerified(force = false) {
  if (!force && Date.now() < dangerVerifiedUntil - 15_000) return;
  const response = await request<{ ok: true; expireAt: string | number }>("/api/admin/security/danger-verify", {
    method: "POST",
    body: JSON.stringify(await promptDangerPayload())
  });
  dangerVerifiedUntil = new Date(response.expireAt).getTime();
}

export function getTotpStatusApi() {
  return request<{ status: TotpStatusView }>("/api/admin/security/totp/status");
}

export function beginTotpSetupApi() {
  return request<{ setup: TotpSetupView }>("/api/admin/security/totp/setup", { method: "POST" });
}

export function enableTotpApi(otp: string, setupToken: string) {
  return request<{ enabled: true; recoveryCodes: string[] }>("/api/admin/security/totp/enable", {
    method: "POST",
    body: JSON.stringify({ otp, setupToken })
  });
}

export async function disableTotpApi() {
  await ensureDangerVerified();
  return request<{ ok: true }>("/api/admin/security/totp/disable", { method: "POST" });
}

export async function regenerateRecoveryCodesApi() {
  await ensureDangerVerified();
  return request<{ recoveryCodes: string[] }>("/api/admin/security/totp/recovery-codes", { method: "POST" });
}

export async function resetTotpApi() {
  await ensureDangerVerified();
  return request<{ setup: TotpSetupView }>("/api/admin/security/totp/reset", { method: "POST" });
}
