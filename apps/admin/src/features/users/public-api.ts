/**
 * features/users/public-api.ts
 *
 * 用户管理域统一导出入口
 */

export { userService } from "./services/user.service";

export type { ManagedUserDocView, ManagedUserView } from "./types";
