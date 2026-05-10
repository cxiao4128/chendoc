import { env } from "../config/env.js";

type UserIdentity = {
  username: string;
  role: "admin" | "user";
};

export function isSuperAdminUser(user: UserIdentity) {
  return user.role === "admin" && user.username.toLowerCase() === env.defaultAdminUsername.toLowerCase();
}
