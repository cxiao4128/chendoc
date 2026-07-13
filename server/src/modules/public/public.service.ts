import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db, dbRun } from "../../db/client.js";
import { shares } from "../../db/schema.js";
import { now } from "../../utils/date.js";
import { getSiteConfig } from "../settings/site.service.js";
import { resolvePublicShare, verifyShareAccessToken } from "../shares/shares.service.js";
import { renderShareHtml, renderSharePasswordHtml, renderShareUnavailableHtml } from "./renderShareHtml.js";
import { checkShareHtmlCache, getCachedShareHtml, invalidateShareHtmlCache, setCachedShareHtml } from "./share-html-cache.js";
import { getCachedSiteBrand, invalidateSiteBrandCache } from "./site-brand-cache.js";

const bundledLogoUrl = "/site-assets/chendoc-logo-192.webp";
const CSP_NONCE_PLACEHOLDER = "__CHENDOC_CSP_NONCE__";

function materializeScriptNonce(html: string, scriptNonce?: string) {
  if (!scriptNonce) return html.replaceAll(` nonce="${CSP_NONCE_PLACEHOLDER}"`, "");
  if (!/^[A-Za-z0-9+/_=-]{1,128}$/.test(scriptNonce)) throw new Error("Invalid CSP nonce.");
  return html.replaceAll(CSP_NONCE_PLACEHOLDER, scriptNonce);
}

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
async function loadSiteBrand() {
  const config = await getSiteConfig();
  return {
    siteName: config.shortName?.trim() || config.brandName?.trim() || "陈书",
    logoUrl: config.preferRemoteLogo && config.logoUrl ? config.logoUrl : bundledLogoUrl,
    shareFooterText: config.shareFooterText || ""
  };
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
  return await getCachedSiteBrand(loadSiteBrand);
}

// ===== 分享页秒开优化：导出缓存失效函数供外部调用 =====
export { checkShareHtmlCache, invalidateSiteBrandCache, invalidateShareHtmlCache };

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
  let cached = getCachedShareHtml(shareKey, accessToken);
  if (cached && cached.lastModified.getTime() !== resolved.doc.updatedAt.getTime()) {
    invalidateShareHtmlCache(shareKey);
    cached = null;
  }
  if (cached && !accessToken) {
    // 缓存命中，返回缓存的 HTML（包含 ETag 和 Last-Modified）
    return {
      statusCode: 200,
      cacheControl: "private, no-cache, must-revalidate",
      contentHash: cached.contentHash,
      etag: cached.etag,
      lastModified: cached.lastModified,
      html: materializeScriptNonce(cached.html, scriptNonce),
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
    scriptNonce: CSP_NONCE_PLACEHOLDER,
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
    cacheControl: accessToken ? "private, no-store" : "private, no-cache, must-revalidate",
    contentHash,
    etag,
    lastModified: resolved.doc.updatedAt,
    html: materializeScriptNonce(html, scriptNonce),
    recordView: () => recordSharePageView(resolved.share.id)
  };
}
