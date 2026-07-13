// Shared types for settings sub-modules

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

export interface ManagedUser {
  id: number;
  username: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
}

export type UserActor = {
  id: number;
  username: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
};

export type SystemAction =
  | "cleanupExpiredSessions"
  | "cleanupExpiredCaptchas"
  | "cleanupExpiredLogs"
  | "emptyTrash"
  | "refreshStatus"
  | "healthCheck";

export type SettingType = "string" | "json" | "number" | "boolean";

export interface SettingRow {
  key: string;
  value: string;
  type: SettingType;
  encrypted: boolean;
  updatedAt: Date;
}
