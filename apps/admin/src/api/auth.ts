import { encryptRequest } from "../security/cryptoClient";
import { endpoints } from "./endpoints";
import { request } from "./request";

export interface UserProfile {
  id: number;
  username: string;
  role: "admin" | "user";
  status: string;
  isSuperAdmin?: boolean;
}

export async function loginApi(body: Record<string, unknown>) {
  const encryptedBody = await encryptRequest(body);
  return request<{ sessionId: string; sessionKey: string; user: UserProfile }>(endpoints.login, {
    method: "POST",
    body: JSON.stringify(encryptedBody)
  }, { encryptedResponse: true });
}

export async function registerApi(body: Record<string, unknown>) {
  const encryptedBody = await encryptRequest(body);
  return request<{ user: UserProfile }>(endpoints.register, {
    method: "POST",
    body: JSON.stringify(encryptedBody)
  }, { encryptedResponse: true });
}

export function meApi() {
  return request<{ user: UserProfile }>(endpoints.me, {}, { encryptedResponse: true });
}
