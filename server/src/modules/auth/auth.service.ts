import { and, eq, isNull } from "drizzle-orm";
import { ZodError, z } from "zod";
import { db, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { invites, users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { now } from "../../utils/date.js";
import { hashPassword, validateUserRegistration, verifyPassword } from "../../utils/password.js";
import { verifyCaptcha } from "../captcha/captcha.service.js";
import { cleanupExpiredAuthSessions, createAuthSession } from "./session.service.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";

export type AuthErrorCode = "USER_DISABLED" | "USER_NOT_FOUND" | "USER_DELETED" | "INVALID_CREDENTIALS";

export class AuthError extends Error {
  code: AuthErrorCode;
  statusCode: number;

  constructor(code: AuthErrorCode, message: string, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const loginPayloadSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  remember: z.boolean().optional(),
  captchaId: z.string().min(8).optional(),
  captchaCode: z.string().trim().min(1).max(8).optional()
});

const registerPayloadSchema = loginPayloadSchema.extend({
  inviteCode: z.string().trim().min(4).max(32)
});

const changePasswordPayloadSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128)
});

export const registerSchema = registerPayloadSchema;

function publicUser(user: { id: number; username: string; role: "admin" | "user"; status: string }) {
  return { id: user.id, username: user.username, role: user.role, status: user.status, isSuperAdmin: isSuperAdminUser(user) };
}

function canSkipLoginCaptcha(user: { username: string; role: "admin" | "user" }) {
  return user.role === "admin" && user.username.toLowerCase() === env.defaultAdminUsername.toLowerCase();
}

function invalidCredentials() {
  return new AuthError("INVALID_CREDENTIALS", "登录失败，请检查账号、密码或验证码");
}

export async function login(input: unknown) {
  const body = loginPayloadSchema.parse(input);
  const password = body.password;
  const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.username, body.username)).limit(1));
  if (!user) {
    throw new AuthError("USER_NOT_FOUND", "账号不存在或已被注销", 404);
  }
  if (user.status !== "active") {
    throw new AuthError("USER_DISABLED", "你已被管理员禁止登录", 403);
  }

  const shouldSkipCaptcha = canSkipLoginCaptcha(user);
  if (!shouldSkipCaptcha && (!body.captchaId || !body.captchaCode || !(await verifyCaptcha(body.captchaId, body.captchaCode)))) {
    throw invalidCredentials();
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    throw invalidCredentials();
  }

  await cleanupExpiredAuthSessions();
  return { ...await createAuthSession(user.id), user: publicUser(user) };
}

export async function register(input: unknown) {
  const body = registerPayloadSchema.parse(input);
  if (!body.captchaId || !body.captchaCode || !(await verifyCaptcha(body.captchaId, body.captchaCode))) {
    throw new Error("验证码不正确或已过期");
  }

  const password = body.password;
  const validationMessage = validateUserRegistration(body.username, password);
  if (validationMessage) {
    throw new Error(validationMessage);
  }

  const passwordHash = await hashPassword(password);
  const result = await dbTransaction(async (tx) => {
    const invite = await dbGet<typeof invites.$inferSelect>(tx
      .select()
      .from(invites)
      .where(and(eq(invites.code, body.inviteCode.toUpperCase()), eq(invites.status, "unused")))
      .limit(1));

    if (!invite || invite.usedAt || invite.expireAt && invite.expireAt.getTime() <= Date.now()) {
      throw new Error("注册卡密不存在、已使用或已过期");
    }

    const exists = await dbGet<{ id: number }>(tx.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1));
    if (exists) {
      throw new Error("注册失败，请更换账号或稍后重试");
    }

    const createdAt = now();
    const insert = await dbRun(tx.insert(users).values({
      username: body.username,
      passwordHash,
      role: "user",
      status: "active",
      createdAt,
      updatedAt: createdAt
    }));

    const userId = Number(insert.lastInsertRowid);
    const inviteUpdate = await dbRun(tx.update(invites).set({
      status: "used",
      usedBy: userId,
      usedAt: now(),
      updatedAt: now()
    }).where(and(eq(invites.id, invite.id), eq(invites.status, "unused"), isNull(invites.usedAt))));
    if (inviteUpdate.changes !== 1) {
      throw new Error("注册卡密已被使用，请更换卡密");
    }

    return { userId };
  });

  const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, result.userId)).limit(1));
  if (!user) {
    throw new Error("注册失败，请稍后重试");
  }
  return { user: publicUser(user) };
}

export async function changePassword(userId: number, input: unknown) {
  const body = changePasswordPayloadSchema.parse(input);
  const currentPassword = body.currentPassword;
  const newPassword = body.newPassword;
  const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, userId)).limit(1));
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new Error("当前密码不正确");
  }

  if (user.role === "admin") {
    if (newPassword.length < 8) throw new ZodError([]);
  } else {
    const validationMessage = validateUserRegistration(user.username, newPassword);
    if (validationMessage) throw new Error(validationMessage);
  }

  const passwordHash = await hashPassword(newPassword);
  await dbRun(db.update(users).set({ passwordHash, updatedAt: now() }).where(eq(users.id, userId)));
}
