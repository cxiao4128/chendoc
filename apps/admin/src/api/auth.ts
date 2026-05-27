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
  return request<{ sessionId: string; sessionKey: string; user: UserProfile }>(apiPaths.signIn(), {
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

export { submitSignIn as a0, submitSignUp as a1, fetchProfile as a2 };
