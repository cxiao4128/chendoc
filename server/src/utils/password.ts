import bcrypt from "bcryptjs";

const USERNAME_RE = /^[A-Za-z0-9_]{6,}$/;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function validateUserRegistration(username: string, password: string) {
  if (!USERNAME_RE.test(username)) {
    return "账号至少 6 位，只能包含字母、数字、下划线";
  }
  if (password.length < 8) {
    return "密码至少 8 位";
  }
  if (!/[A-Z]/.test(password)) {
    return "密码必须包含大写字母";
  }
  if (!/[a-z]/.test(password)) {
    return "密码必须包含小写字母";
  }
  return null;
}
