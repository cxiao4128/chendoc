import { encryptRequest } from "../security/cryptoClient";
import { apiPaths } from "./endpoints";
import { request } from "./request";

export interface UserProfile {
  id: number;
  username: string;
  role: "admin" | "user";
  status: string;
  isSuperAdmin?: boolean;
}

async function submitSignIn(body: Record<string, unknown>) {
  const encryptedBody = await encryptRequest(body);
  return request<{ sessionId: string; sessionKey: string; user: UserProfile }>(apiPaths.signIn(), {
    method: "POST",
    body: JSON.stringify(encryptedBody)
  }, { encryptedResponse: true });
}

async function submitSignUp(body: Record<string, unknown>) {
  const encryptedBody = await encryptRequest(body);
  return request<{ user: UserProfile }>(apiPaths.signUp(), {
    method: "POST",
    body: JSON.stringify(encryptedBody)
  }, { encryptedResponse: true });
}

function fetchProfile() {
  return request<{ user: UserProfile }>(apiPaths.profile(), {}, { encryptedResponse: true });
}

export { submitSignIn as a0, submitSignUp as a1, fetchProfile as a2 };
