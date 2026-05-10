import { request } from "./request";
import { createEncryptedPayload } from "./rsa";

export interface UserProfile {
  id: number;
  username: string;
  role: "admin" | "user";
  status: string;
  isSuperAdmin?: boolean;
}

export async function loginApi(body: Record<string, unknown>) {
  const encryptedBody = await createEncryptedPayload(body);
  return request<{ sessionId: string; sessionKey: string; user: UserProfile }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(encryptedBody)
  }, { encryptedResponse: true });
}

export async function registerApi(body: Record<string, unknown>) {
  const encryptedBody = await createEncryptedPayload(body);
  return request<{ user: UserProfile }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(encryptedBody)
  }, { encryptedResponse: true });
}

export function meApi() {
  return request<{ user: UserProfile }>("/api/auth/me", {}, { encryptedResponse: true });
}
