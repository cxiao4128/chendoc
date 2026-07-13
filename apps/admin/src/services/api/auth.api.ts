import { a0, a1, a2, a3, a4 } from "../../api/auth";

export type { UserProfile } from "../../api/auth";

// 命名导出，供 stores 层使用
export const loginApi = a0;
export const registerApi = a1;
export const fetchProfileApi = a2;
export const logoutApi = a3;
export const restoreSessionApi = a4;

export const authApi = {
  login: a0,
  register: a1,
  me: a2,
  logout: a3,
  restore: a4
};
