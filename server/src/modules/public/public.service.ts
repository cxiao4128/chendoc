import { env } from "../../config/env.js";
import { getSiteConfig } from "../settings/settings.service.js";
import { getPublicShare, resolvePublicShare, verifyShareAccessToken } from "../shares/shares.service.js";
import { renderShareHtml, renderSharePasswordHtml, renderShareUnavailableHtml } from "./renderShareHtml.js";

const bundledLogoUrl = "/site-assets/chendoc-logo.png";

function buildShareUrl(pathKey: string | number) {
  return `${env.publicSiteUrl.replace(/\/+$/, "")}/r/${pathKey}`;
}

function messageForReason(reason: "missing" | "disabled" | "expired" | "deleted") {
  if (reason === "disabled") return "这个分享已经被关闭。";
  if (reason === "expired") return "这个分享已经过期。";
  if (reason === "deleted") return "这篇文档已经被移除。";
  return "分享不存在。";
}

async function sharePageBrand() {
  const config = await getSiteConfig();
  const siteName = config.brandName?.trim() || config.shortName?.trim() || "陈书 / ChenDoc";
  const configuredLogo = config.logoUrl?.trim();
  return {
    siteName,
    logoUrl: config.preferRemoteLogo && configuredLogo ? configuredLogo : bundledLogoUrl
  };
}

export async function renderSharePage(shareKey: string | number, accessToken?: string) {
  const brand = await sharePageBrand();
  const resolved = await resolvePublicShare(shareKey);
  if (!resolved.ok) {
    return {
      statusCode: resolved.reason === "missing" || resolved.reason === "deleted" ? 404 : 403,
      html: renderShareUnavailableHtml({
        title: "分享暂不可用",
        message: messageForReason(resolved.reason),
        ...brand
      })
    };
  }

  const pathKey = resolved.share.customSlug || String(resolved.share.shareCode);
  const shareUrl = buildShareUrl(pathKey);
  if (resolved.protected && !verifyShareAccessToken(accessToken, resolved.share.shareCode, resolved.doc.id)) {
    return {
      statusCode: accessToken ? 401 : 200,
      html: renderSharePasswordHtml({
        title: resolved.doc.title,
        shareKey: String(shareKey),
        shareUrl,
        ...brand,
        errorMessage: accessToken ? "访问凭证已失效，请重新输入密码。" : ""
      })
    };
  }

  const data = await getPublicShare(shareKey, true);
  if (!data) {
    return {
      statusCode: 404,
      html: renderShareUnavailableHtml({
        title: "分享暂不可用",
        message: "当前链接暂时无法访问。",
        ...brand
      })
    };
  }

  const finalPathKey = data.share.customSlug || String(data.share.shareCode);
  return {
    statusCode: 200,
    html: renderShareHtml({
      title: data.doc.title,
      summary: data.doc.summary || "",
      coverUrl: data.doc.coverUrl || "",
      contentHtml: data.doc.contentHtml,
      shareUrl: buildShareUrl(finalPathKey),
      ...brand,
      updatedAt: data.doc.updatedAt
    })
  };
}
