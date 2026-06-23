import { randomBytes } from "node:crypto";

export function generateShareToken() {
  return `s_${randomBytes(32).toString("base64url")}`;
}

export function isWeakShareToken(token: string | null | undefined, shareCode?: number | string | null) {
  const value = String(token ?? "").trim();
  if (!value) return true;
  if (shareCode !== undefined && shareCode !== null && value === String(shareCode)) return true;
  if (value.startsWith("legacy-")) return true;
  return value.length < 40;
}
