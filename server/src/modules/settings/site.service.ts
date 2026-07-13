// Site settings service

import { z } from "zod";
import { setSetting } from "./core.service.js";
import { settingValues, booleanFromSettings, valueFromSettings } from "./core.repo.js";
import { env } from "../../config/env.js";
import type { SiteConfig } from "./types.js";
import { invalidateShareHtmlCache } from "../public/share-html-cache.js";
import { invalidateSiteBrandCache } from "../public/site-brand-cache.js";

const siteConfigSchema = z.object({
  brandName: z.string().trim().min(1).max(80).default("陈书 / ChensDoc"),
  shortName: z.string().trim().min(1).max(24).default("陈书"),
  logoUrl: z.string().trim().url().or(z.literal("")).default(""),
  authWallpaperUrl: z.string().trim().url().or(z.literal("")).default(""),
  preferRemoteLogo: z.boolean().default(false),
  preferRemoteWallpaper: z.boolean().default(false),
  copyright: z.string().trim().max(120).default("Copyright © 2026 陈书. All rights reserved"),
  recoveryContact: z.string().trim().max(120).default("请联系管理员"),
  shareFooterText: z.string().trim().max(180).default("")
});

export const defaultRemoteLogoUrl = "";
export const defaultRemoteWallpaperUrl = "";
const REMOTE_ASSET_TIMEOUT_MS = 5000;
const REMOTE_LOGO_MAX_BYTES = 1024 * 1024;
const REMOTE_WALLPAPER_MAX_BYTES = 5 * 1024 * 1024;
const allowedRemoteAssetTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

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

export function invalidateSitePresentationCaches() {
  invalidateSiteBrandCache();
  invalidateShareHtmlCache();
}

export async function saveSiteConfig(input: unknown): Promise<SiteConfig> {
  const body = siteConfigSchema.parse(input);
  const logoUrl = body.logoUrl ? await validateRemoteAssetUrl(body.logoUrl, "logo") : "";
  const wallpaperUrl = body.authWallpaperUrl ? await validateRemoteAssetUrl(body.authWallpaperUrl, "wallpaper") : "";
  try {
    await setSetting("site.brand_name", body.brandName);
    await setSetting("site.short_name", body.shortName);
    await setSetting("site.logo_url", logoUrl);
    await setSetting("site.auth_wallpaper_url", wallpaperUrl);
    await setSetting("site.prefer_remote_logo", String(body.preferRemoteLogo && !!logoUrl), "boolean");
    await setSetting("site.prefer_remote_wallpaper", String(body.preferRemoteWallpaper && !!wallpaperUrl), "boolean");
    await setSetting("site.copyright", body.copyright);
    await setSetting("site.recovery_contact", body.recoveryContact);
    await setSetting("site.share_footer_text", body.shareFooterText);
  } finally {
    invalidateSitePresentationCaches();
  }
  return await getSiteConfig();
}
