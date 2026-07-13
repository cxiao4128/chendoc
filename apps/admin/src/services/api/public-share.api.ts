import { gatewayClientRequest } from "@/gateway/client";

export interface PublicShareDocument {
  title: string;
  summary?: string | null;
  coverUrl?: string | null;
  updatedAt: string;
  contentHtml: string;
}

export interface PublicShareView {
  doc: Partial<PublicShareDocument>;
  share: {
    shareId: number;
    customSlug?: string | null;
    viewCount: number;
  };
  protected: boolean;
  unlocked: boolean;
}

export interface PublicSharePasswordResult {
  ok: boolean;
  token?: string;
  code?: string;
  message?: string;
}

export interface PublicShareSiteConfig {
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

type ErrorPayload = {
  code?: unknown;
  message?: unknown;
};

export class PublicShareApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PublicShareApiError";
    this.status = status;
    this.code = code;
  }
}

function errorFromPayload(payload: unknown, fallback: string, status: number) {
  const value = payload && typeof payload === "object" ? payload as ErrorPayload : null;
  const message = typeof value?.message === "string" && value.message.trim() ? value.message : fallback;
  const code = typeof value?.code === "string" ? value.code : undefined;
  return new PublicShareApiError(message, status, code);
}

async function publicShareGatewayRequest<T>(url: string, options: RequestInit = {}, accessToken?: string) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const { response, payload } = await gatewayClientRequest<T>(url, options, headers);
  if (!response.ok) throw errorFromPayload(payload, "分享暂不可用，请稍后重试。", response.status);
  return payload;
}

export function getPublicShareApi(shareKey: string, accessToken?: string) {
  return publicShareGatewayRequest<PublicShareView>(
    `/api/public/r/${encodeURIComponent(shareKey)}`,
    { method: "GET", cache: "no-store" },
    accessToken
  );
}

export function getPublicShareSiteConfigApi() {
  return publicShareGatewayRequest<{ config: PublicShareSiteConfig }>(
    "/api/public/settings/site",
    { method: "GET", cache: "no-store" }
  );
}

export function verifyPublicSharePasswordApi(shareKey: string, password: string) {
  return publicShareGatewayRequest<PublicSharePasswordResult>(
    `/api/public/r/${encodeURIComponent(shareKey)}/verify-password`,
    {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ password })
    }
  );
}
