import type { UserProfile } from "../api/auth";

export type WorkspaceBase = "/admin" | "/users";

type RoleUser = Pick<UserProfile, "role" | "isSuperAdmin"> | null | undefined;

export function isAdminUser(user: RoleUser) {
  return user?.isSuperAdmin === true;
}

export function homeForUser(user: RoleUser) {
  return isAdminUser(user) ? "/admin/docs" : "/users/docs";
}

export function workspaceBaseForPath(path: string): WorkspaceBase {
  return path.startsWith("/users") ? "/users" : "/admin";
}

export function isAdminPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}

export function isUsersPath(path: string) {
  return path === "/users" || path.startsWith("/users/");
}

export function docsPath(base: WorkspaceBase) {
  return `${base}/docs`;
}

export function trashPath(base: WorkspaceBase) {
  return `${base}/trash`;
}

export function docPath(base: WorkspaceBase, docUid: string) {
  return `${base}/docs/${docUid}`;
}

export function allowedPostLoginPath(user: RoleUser, redirect: unknown) {
  const fallback = homeForUser(user);
  const raw = Array.isArray(redirect) ? redirect[0] : redirect;
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw === "/" || raw === "/login" || raw === "/register") return fallback;
  if (isAdminUser(user)) return isUsersPath(raw) ? fallback : raw;
  return isAdminPath(raw) ? fallback : raw;
}
