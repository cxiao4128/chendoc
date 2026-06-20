import { buildAuthorization, clearAuthSession, getAuthToken, saveAuthSession, shouldRefreshAuthSession } from "../security/sessionToken";
import { buildClientRiskHeader } from "../security/runtimeGuard";
import { gatewayClientRequest, shouldUseGateway } from "../gateway/client";
import { apiPaths, isCredentialEndpoint, resolveApiPath } from "./endpoints";
import { recordClientError } from "../utils/clientTelemetry";

const DEFAULT_ERROR_MESSAGE = "请求失败";
const LOGIN_NOTICE_KEY = "chendoc_login_notice";
const LOGIN_REDIRECT_KEY = "chendoc_login_redirect";
const SESSION_STATUS_EVENT = "chendoc:session-status";

function notifySessionStatus(status: "expiring" | "restored" | "failed") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_STATUS_EVENT, { detail: { status } }));
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message || DEFAULT_ERROR_MESSAGE);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function getApiErrorMessage(error: unknown, fallback = DEFAULT_ERROR_MESSAGE) {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  return fallback;
}

export function getToken() {
  return getAuthToken();
}

export function setToken(token: string, expiresAt: string | number | Date) {
  saveAuthSession(token, expiresAt);
}

export function clearToken() {
  clearAuthSession();
}

function shouldRedirectUnauthorized(url: string) {
  const path = resolveApiPath(url);
  return path !== apiPaths.signIn() && path !== apiPaths.signUp();
}

function authMessageFromCode(code: string) {
  if (code === "USER_DISABLED") return "你已被管理员禁止登录";
  if (code === "USER_NOT_FOUND" || code === "USER_DELETED") return "账号不存在或已被注销";
  return "登录状态已失效，请重新登录";
}

function rememberLoginState(redirect: string, notice?: string) {
  try {
    if (redirect && redirect !== "/") window.sessionStorage.setItem(LOGIN_REDIRECT_KEY, redirect);
    if (notice) window.sessionStorage.setItem(LOGIN_NOTICE_KEY, notice);
  } catch {
    // Session storage is optional; the clean login URL is the contract.
  }
}

function redirectToLogin(url: string, code?: string, message?: string) {
  if (!shouldRedirectUnauthorized(url)) return;
  clearToken();
  if (typeof window === "undefined" || window.location.pathname === "/login") return;

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const notice = code ? authMessageFromCode(code) : message;
  rememberLoginState(current, notice);
  window.location.assign("/login");
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  const riskHeader = buildClientRiskHeader();
  if (riskHeader) headers.set("X-Client-Risk", riskHeader);

  if (!isCredentialEndpoint(url)) {
    if (shouldAutoRefresh(url)) await refreshAuthSession();
    const authorization = await buildAuthorization();
    if (authorization) headers.set("Authorization", authorization);
  }

  if (options.body && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const result = shouldUseGateway(url, options.body)
    ? await gatewayClientRequest<unknown>(url, options, headers)
    : await directRequest(url, options, headers);
  const { response, payload } = result;

  if (!response.ok) {
    const payloadRecord = typeof payload === "object" && payload ? payload as Record<string, unknown> : null;
    const message = payloadRecord && "message" in payloadRecord ? String(payloadRecord.message) : DEFAULT_ERROR_MESSAGE;
    const code = payloadRecord && typeof payloadRecord.code === "string" ? payloadRecord.code : undefined;
    if (response.status === 401) redirectToLogin(url, code, message);
    throw new ApiError(message, response.status, code);
  }

  return payload as T;
}

function shouldAutoRefresh(url: string) {
  const path = resolveApiPath(url);
  return path !== "/api/auth/refresh" && path !== "/api/auth/logout" && shouldRefreshAuthSession();
}

let refreshInFlight: Promise<void> | null = null;

async function refreshAuthSession() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      notifySessionStatus("expiring");
      const data = await request<{ token: string; expiresAt?: string | number | Date }>("/api/auth/refresh", { method: "POST" });
      saveAuthSession(data.token, data.expiresAt || Date.now() + 2 * 60 * 60 * 1000);
      notifySessionStatus("restored");
    } catch (error) {
      recordClientError("auth.refresh", error);
      notifySessionStatus("failed");
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function directRequest(url: string, options: RequestInit, headers: Headers) {
  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, payload };
}
