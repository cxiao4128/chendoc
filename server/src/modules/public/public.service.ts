import { env } from "../../config/env.js";
import { getPublicShare, resolvePublicShare, verifyShareAccessToken } from "../shares/shares.service.js";
import { renderShareHtml, renderSharePasswordHtml, renderShareUnavailableHtml } from "./renderShareHtml.js";

function buildShareUrl(pathKey: string | number) {
  return `${env.publicSiteUrl.replace(/\/+$/, "")}/r/${pathKey}`;
}

function messageForReason(reason: "missing" | "disabled" | "expired" | "deleted") {
  if (reason === "disabled") return "这个分享已经被关闭。";
  if (reason === "expired") return "这个分享已经过期。";
  if (reason === "deleted") return "这篇文档已经被移除。";
  return "分享不存在。";
}

export function renderSharePage(shareKey: string | number, accessToken?: string) {
  const resolved = resolvePublicShare(shareKey);
  if (!resolved.ok) {
    return {
      statusCode: resolved.reason === "missing" || resolved.reason === "deleted" ? 404 : 403,
      html: renderShareUnavailableHtml({
        title: "分享暂不可用",
        message: messageForReason(resolved.reason)
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
        errorMessage: accessToken ? "访问凭证已失效，请重新输入密码。" : ""
      })
    };
  }

  const data = getPublicShare(shareKey, true);
  if (!data) {
    return {
      statusCode: 404,
      html: renderShareUnavailableHtml({
        title: "分享暂不可用",
        message: "当前链接暂时无法访问。"
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
      updatedAt: data.doc.updatedAt
    })
  };
}
