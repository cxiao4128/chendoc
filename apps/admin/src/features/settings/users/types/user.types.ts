/**
 * users/types/user.types.ts
 * 用户管理类型
 */
import type { ManagedUserView, OperationLogView } from "../../../../services/api/settings.api";

export type { ManagedUserView, OperationLogView };

export type UserDetailTab = "info" | "roles" | "login" | "actions";

export interface AuthContext {
  isSuperAdmin: boolean;
  user: { id: number; username: string } | null;
}
