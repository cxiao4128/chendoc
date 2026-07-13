import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db, dbRun } from "../../db/client.js";
import { shares } from "../../db/schema.js";
import { now } from "../../utils/date.js";
import { getSiteConfig } from "../settings/site.service.js";
import { resolvePublicShare, verifyShareAccessToken } from "../shares/shares.service.js";
import { renderShareHtml, renderSharePasswordHtml, renderShareUnavailableHtml } from "./renderShareHtml.js";

const bundledLogoUrl = "/site-assets/chendoc-logo-192.webp";

type SharePageResponse = {
  statusCode: number;
  cacheControl: string;
  html: string;
  etag?: string;
  contentHash?: string;
  lastModified?: Date;
  recordView?: () => void;
};

// ===== 分享页秒开优化：站点配置内存缓存 =====
interface CachedSiteBrand {
  siteName: string;
  logoUrl: string;
  shareFooterText: string;
  cachedAt: number;
}

const SITE_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存
let cachedSiteBrand: CachedSiteBrand | null = null;

async function getCachedSiteBrand(): Promise<CachedSiteBrand> {
  const nowMs = Date.now();
  if (cachedSiteBrand && (nowMs - cachedSiteBrand.cachedAt) < SITE_CONFIG_CACHE_TTL_MS) {
    return cachedSiteBrand;
  }
  const config = await getSiteConfig();
  cachedSiteBrand = {
    siteName: config.shortName?.trim() || config.brandName?.trim() || "陈书",
    logoUrl: config.preferRemoteLogo && config.logoUrl ? config.logoUrl : bundledLogoUrl,
    shareFooterText: config.shareFooterText || "",
    cachedAt: nowMs
  };
  return cachedSiteBrand;
}

function invalidateSiteBrandCache() {
  cachedSiteBrand = null;
}

// ===== 分享页秒开优化：HTML 预渲染缓存 =====
interface CachedShareHtml {
  html: string;
  contentHash: string;
  etag: string;
  lastModified: Date;
  cachedAt: number;
}

const SHARE_HTML_CACHE_MAX_SIZE = 500;
const SHARE_HTML_CACHE_TTL_MS = 2 * 60 * 1000; // 2分钟缓存（允许快速内容更新）
const shareHtmlCache = new Map<string, CachedShareHtml>();

function getCachedShareHtml(shareKey: string | number, accessToken?: string): CachedShareHtml | null {
  if (accessToken) return null; // 有 token 的不缓存（密码保护场景）
  const cached = shareHtmlCache.get(String(shareKey));
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > SHARE_HTML_CACHE_TTL_MS) {
    shareHtmlCache.delete(String(shareKey));
    return null;
  }
  return cached;
}

function setCachedShareHtml(shareKey: string | number, html: CachedShareHtml) {
  if (shareHtmlCache.size >= SHARE_HTML_CACHE_MAX_SIZE) {
    // 简单的 LRU：删除最早的 20%
    const entries = Array.from(shareHtmlCache.entries());
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const deleteCount = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < deleteCount; i++) {
      shareHtmlCache.delete(entries[i][0]);
    }
  }
  shareHtmlCache.set(String(shareKey), html);
}

function invalidateShareHtmlCache(shareKey?: string | number) {
  if (shareKey) {
    shareHtmlCache.delete(String(shareKey));
  } else {
    shareHtmlCache.clear();
  }
}

function buildShareUrl(pathKey: string | number) {
  return `${env.publicSiteUrl.replace(/\/+$/, "")}/r/${pathKey}`;
}

function hashShareHtml(html: string) {
  return createHash("sha256").update(html).digest("base64url");
}

function shareEtag(contentHash: string) {
  return `"share-${contentHash}"`;
}

function recordSharePageView(shareId: number) {
  // View count must not block public first paint.
  void dbRun(db.update(shares).set({
    viewCount: sql`${shares.viewCount} + 1`,
    updatedAt: now()
  }).where(eq(shares.id, shareId))).catch(() => undefined);
}

// ===== 分享页秒开优化：并行获取品牌配置 =====
function unavailableShareMessage() {
  return "分享暂不可用或不存在。";
}

async function sharePageBrand() {
  return await getCachedSiteBrand();
}

// ===== 分享页秒开优化：检查缓存并返回 =====
export function checkShareHtmlCache(shareKey: string | number, accessToken?: string, ifNoneMatch?: string, ifModifiedSince?: Date): {
  cached: CachedShareHtml;
  hit304: boolean;
} | null {
  const cached = getCachedShareHtml(shareKey, accessToken);
  if (!cached) return null;

  // ETag 检查
  if (ifNoneMatch) {
    const clientEtag = ifNoneMatch.replace(/^W\//, "").replace(/^["']|["']$/g, "");
    if (clientEtag === cached.etag.replace(/^"|"$/g, "")) {
      return { cached, hit304: true };
    }
  }

  // Last-Modified 检查
  if (ifModifiedSince && cached.lastModified && cached.lastModified.getTime() <= ifModifiedSince.getTime()) {
    return { cached, hit304: true };
  }

  return { cached, hit304: false };
}

// ===== 分享页秒开优化：导出缓存失效函数供外部调用 =====
export { invalidateSiteBrandCache, invalidateShareHtmlCache };

export async function renderSharePage(shareKey: string | number, accessToken?: string, scriptNonce?: string): Promise<SharePageResponse> {
  const [brand, resolved] = await Promise.all([
    sharePageBrand(),
    resolvePublicShare(shareKey)
  ]);

  if (!resolved.ok) {
    return {
      statusCode: 404,
      cacheControl: "no-store",
      html: renderShareUnavailableHtml({
        title: "分享暂不可用",
        message: unavailableShareMessage(),
        ...brand,
        scriptNonce
      })
    };
  }

  const pathKey = resolved.share.customSlug || String(resolved.share.shareCode);
  const shareUrl = buildShareUrl(pathKey);

  // 密码保护分享：需要验证 token，不缓存
  if (resolved.protected && !verifyShareAccessToken(accessToken, resolved.share, resolved.doc.id)) {
    return {
      statusCode: accessToken ? 401 : 200,
      cacheControl: "no-store",
      html: renderSharePasswordHtml({
        title: "受保护文档",
        shareKey: String(shareKey),
        shareUrl,
        scriptNonce,
        ...brand,
        errorMessage: accessToken ? "访问凭证已失效，请重新输入密码。" : ""
      })
    };
  }

  // ===== 分享页秒开优化：尝试从缓存获取 =====
  const cached = getCachedShareHtml(shareKey, accessToken);
  if (cached && !accessToken) {
    // 缓存命中，返回缓存的 HTML（包含 ETag 和 Last-Modified）
    return {
      statusCode: 200,
      cacheControl: "public, max-age=60, stale-while-revalidate=300",
      contentHash: cached.contentHash,
      etag: cached.etag,
      lastModified: cached.lastModified,
      html: cached.html,
      recordView: () => recordSharePageView(resolved.share.id)
    };
  }

  // 渲染 HTML
  const html = renderShareHtml({
    title: resolved.doc.title,
    summary: resolved.doc.summary || "",
    coverUrl: resolved.doc.coverUrl || "",
    contentHtml: resolved.doc.contentHtml,
    shareUrl,
    ...brand,
    scriptNonce,
    updatedAt: resolved.doc.updatedAt
  });
  const contentHash = hashShareHtml(html);
  const etag = shareEtag(contentHash);

  // ===== 分享页秒开优化：缓存渲染结果 =====
  if (!accessToken) {
    setCachedShareHtml(shareKey, {
      html,
      contentHash,
      etag,
      lastModified: resolved.doc.updatedAt,
      cachedAt: Date.now()
    });
  }

  return {
    statusCode: 200,
    cacheControl: accessToken ? "private, no-store" : "public, max-age=60, stale-while-revalidate=300",
    contentHash,
    etag,
    lastModified: resolved.doc.updatedAt,
    html,
    recordView: () => recordSharePageView(resolved.share.id)
  };
}
