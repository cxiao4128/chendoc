import { clearAuthSession, createEncryptedAuthorization, createResponseDecryptor, getSessionId, isEncryptedResponse, setAuthSession } from "./rsa";

const DEFAULT_ERROR_MESSAGE = "请求失败";
const LOGIN_API_PATH = "/api/auth/login";
const REGISTER_API_PATH = "/api/auth/register";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message || DEFAULT_ERROR_MESSAGE);
    this.name = "ApiError";
    this.status = status;
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
  setAuthSession(sessionId, sessionKey);
}

export function clearToken() {
  localStorage.removeItem("chendoc_token");
  clearAuthSession();
}

export interface SecureRequestOptions {
  encryptedResponse?: boolean;
}

function getRequestPath(url: string) {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function shouldRedirectUnauthorized(url: string) {
  const path = getRequestPath(url);
  return path !== LOGIN_API_PATH && path !== REGISTER_API_PATH;
}

function redirectToLogin(url: string) {
  if (!shouldRedirectUnauthorized(url)) return;
  clearToken();
  if (typeof window === "undefined" || window.location.pathname === "/login") return;

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const redirect = current && current !== "/" ? `?redirect=${encodeURIComponent(current)}` : "";
  window.location.assign(`/login${redirect}`);
}

export async function request<T>(url: string, options: RequestInit = {}, secure: SecureRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const responseDecryptor = secure.encryptedResponse ? await createResponseDecryptor() : null;
  if (responseDecryptor) headers.set("X-Response-Public-Key", responseDecryptor.publicKeyHeader);

  if (getToken()) headers.set("Authorization", await createEncryptedAuthorization());
  if (options.body && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get("Content-Type") || "";
  const rawPayload = contentType.includes("application/json") ? await response.json() : await response.text();
  const payload = isEncryptedResponse(rawPayload) && responseDecryptor
    ? await responseDecryptor.decrypt<unknown>(rawPayload.encryptedData)
    : rawPayload;
  if (!response.ok) {
    if (response.status === 401) redirectToLogin(url);
    const message = typeof payload === "object" && payload && "message" in payload ? String(payload.message) : DEFAULT_ERROR_MESSAGE;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}
