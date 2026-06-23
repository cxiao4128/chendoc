type UserIdentity = {
  username: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean | number;
};

export function isSuperAdminUser(user: UserIdentity) {
  return user.role === "admin" && (user.isSuperAdmin === true || user.isSuperAdmin === 1);
}
