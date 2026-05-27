import { buildAuthorization, clearAuthSession, getSessionId, saveAuthSession } from "../security/sessionToken";
import { buildClientRiskHeader } from "../security/runtimeGuard";
import { gatewayClientRequest, shouldUseGateway } from "../gateway/client";
import { apiPaths, isCredentialEndpoint, resolveApiPath } from "./endpoints";

const DEFAULT_ERROR_MESSAGE = "请求失败";
const LOGIN_NOTICE_KEY = "chendoc_login_notice";

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
  localStorage.removeItem("chendoc_token");
  return getSessionId();
}

export function setToken(sessionId: string, sessionKey: string) {
  saveAuthSession(sessionId, sessionKey);
}

export function clearToken() {
  localStorage.removeItem("chendoc_token");
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

function redirectToLogin(url: string, code?: string, message?: string) {
  if (!shouldRedirectUnauthorized(url)) return;
  clearToken();
  if (typeof window === "undefined" || window.location.pathname === "/login") return;

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const params = new URLSearchParams();
  if (current && current !== "/") params.set("redirect", current);
  const notice = code ? authMessageFromCode(code) : message;
  if (notice) {
    window.sessionStorage.setItem(LOGIN_NOTICE_KEY, notice);
    params.set("message", notice);
  }
  const query = params.toString();
  window.location.assign(`/login${query ? `?${query}` : ""}`);
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  const riskHeader = buildClientRiskHeader();
  if (riskHeader) headers.set("X-Client-Risk", riskHeader);

  if (!isCredentialEndpoint(url)) {
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

async function directRequest(url: string, options: RequestInit, headers: Headers) {
  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, payload };
}
