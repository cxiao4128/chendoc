import { clearAuthSession, createEncryptedAuthorization, createResponseDecryptor, getSessionId, isEncryptedResponse, setAuthSession } from "./rsa";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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
    const message = typeof payload === "object" && payload && "message" in payload ? String(payload.message) : "请求失败";
    throw new ApiError(message, response.status);
  }
  return payload as T;
}
