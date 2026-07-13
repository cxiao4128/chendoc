/**
 * features/settings/users/hooks/managedUsersShared.ts
 * 用户管理共享工具
 */
import type { ManagedUserView } from "../../../../services/api/settings.api";

export type UserDetailTab = "info" | "roles" | "login" | "actions";

export interface AuthContext {
  isSuperAdmin: boolean;
  user: { id: number; username: string } | null;
}

export function roleText(user: Pick<ManagedUserView, "role" | "isSuperAdmin">) {
  if (user.isSuperAdmin) return "超级管理员";
  return user.role === "admin" ? "管理员" : "普通用户";
}

export function statusText(status: "active" | "disabled") {
  return status === "active" ? "可登录" : "已禁止登录";
}

export function userInitials(username: string) {
  return username.slice(0, 2).toUpperCase();
}
