import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db, dbRun } from "../../db/client.js";
import { shares } from "../../db/schema.js";
import { now } from "../../utils/date.js";
import { getSiteConfig } from "../settings/settings.service.js";
import { resolvePublicShare, verifyShareAccessToken } from "../shares/shares.service.js";
import { renderShareHtml, renderSharePasswordHtml, renderShareUnavailableHtml } from "./renderShareHtml.js";

const bundledLogoUrl = "/site-assets/chendoc-logo-192.png";

type SharePageResponse = {
  statusCode: number;
  cacheControl: string;
  html: string;
  etag?: string;
  contentHash?: string;
  lastModified?: Date;
  recordView?: () => void;
};

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

function messageForReason(reason: "missing" | "disabled" | "expired" | "deleted") {
  if (reason === "disabled") return "这个分享已经被关闭。";
  if (reason === "expired") return "这个分享已经过期。";
  if (reason === "deleted") return "这篇文档已经被移除。";
  return "分享不存在。";
}

async function sharePageBrand() {
  const config = await getSiteConfig();
  const siteName = config.shortName?.trim() || config.brandName?.trim() || "陈书";
  const configuredLogo = config.logoUrl?.trim();
  return {
    siteName,
    logoUrl: config.preferRemoteLogo && configuredLogo ? configuredLogo : bundledLogoUrl,
    shareFooterText: config.shareFooterText
  };
}

export async function renderSharePage(shareKey: string | number, accessToken?: string, scriptNonce?: string): Promise<SharePageResponse> {
  const brand = await sharePageBrand();
  const resolved = await resolvePublicShare(shareKey);
  if (!resolved.ok) {
    return {
      statusCode: resolved.reason === "missing" || resolved.reason === "deleted" ? 404 : 403,
      cacheControl: "no-store",
      html: renderShareUnavailableHtml({
        title: "分享暂不可用",
        message: messageForReason(resolved.reason),
        ...brand
      })
    };
  }

  const pathKey = String(resolved.share.shareCode);
  const shareUrl = buildShareUrl(pathKey);
  if (resolved.protected && !verifyShareAccessToken(accessToken, resolved.share, resolved.doc.id)) {
    return {
      statusCode: accessToken ? 401 : 200,
      cacheControl: "no-store",
      html: renderSharePasswordHtml({
        title: resolved.doc.title,
        shareKey: String(shareKey),
        shareUrl,
        scriptNonce,
        ...brand,
        errorMessage: accessToken ? "访问凭证已失效，请重新输入密码。" : ""
      })
    };
  }

  const html = renderShareHtml({
    title: resolved.doc.title,
    summary: resolved.doc.summary || "",
    coverUrl: resolved.doc.coverUrl || "",
    contentHtml: resolved.doc.contentHtml,
    shareUrl,
    ...brand,
    updatedAt: resolved.doc.updatedAt
  });
  const contentHash = hashShareHtml(html);

  return {
    statusCode: 200,
    cacheControl: "public, max-age=60, stale-while-revalidate=300",
    contentHash,
    etag: shareEtag(contentHash),
    lastModified: resolved.doc.updatedAt,
    html,
    recordView: () => recordSharePageView(resolved.share.id)
  };
}
