import { apiPaths } from "./endpoints";
import { request } from "./request";

export interface UserProfile {
  id: number;
  username: string;
  role: "admin" | "user";
  status: string;
  isSuperAdmin?: boolean;
  currentIp?: string | null;
}

async function submitSignIn(body: Record<string, unknown>) {
  return request<{ token: string; expiresAt?: string; user: UserProfile }>(apiPaths.signIn(), {
    method: "POST",
    body: JSON.stringify(body)
  });
}

async function submitSignUp(body: Record<string, unknown>) {
  return request<{ user: UserProfile }>(apiPaths.signUp(), {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function fetchProfile() {
  return request<{ user: UserProfile }>(apiPaths.profile(), {
    method: "POST",
    body: JSON.stringify({})
  });
}

function logoutApi() {
  return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

function restoreSessionApi() {
  return request<{ token: string; expiresAt?: string; user: UserProfile }>("/api/auth/restore", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export { submitSignIn as a0, submitSignUp as a1, fetchProfile as a2, logoutApi as a3, restoreSessionApi as a4 };
