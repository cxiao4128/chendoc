import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { invites, users } from "../../db/schema.js";
import { now } from "../../utils/date.js";
import { hashPassword, validatePassword, validateUserRegistration, verifyPassword } from "../../utils/password.js";
import { verifyCaptcha } from "../captcha/captcha.service.js";
import { cleanupExpiredAuthSessions, createAuthSession, revokeUserAuthSessions } from "./session.service.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";
import { assessLoginRisk, clearLoginFailuresForUsername, recordLoginFailure, recordLoginSuccess, type LoginRiskDecision } from "./loginRisk.service.js";
import { verifyAdminSecondFactor } from "./totp.service.js";
import { AppError, BadRequestError } from "../../utils/errors.js";

export type AuthErrorCode =
  | "USER_DISABLED"
  | "USER_NOT_FOUND"
  | "USER_DELETED"
  | "INVALID_CREDENTIALS"
  | "CAPTCHA_REQUIRED"
  | "LOGIN_LOCKED"
  | "TOTP_REQUIRED";

export class AuthError extends AppError {
  constructor(code: AuthErrorCode, message: string, statusCode = 401) {
    super(statusCode, code, message);
  }
}

const loginPayloadSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  captchaId: z.string().min(8).optional(),
  captchaCode: z.string().trim().min(1).max(8).optional(),
  otp: z.string().trim().min(4).max(16).optional(),
  recoveryCode: z.string().trim().min(6).max(32).optional()
});

const registerPayloadSchema = loginPayloadSchema.extend({
  inviteCode: z.string().trim().min(4).max(32)
});

const changePasswordPayloadSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128)
});

const ADMIN_TOTP_AFTER_FAILURES = 5;

export const registerSchema = registerPayloadSchema;

function publicUser(user: { id: number; username: string; role: "admin" | "user"; status: string }, currentIp?: string) {
  return { id: user.id, username: user.username, role: user.role, status: user.status, isSuperAdmin: isSuperAdminUser(user), currentIp };
}

function invalidCredentials() {
  return new AuthError("INVALID_CREDENTIALS", "账号或密码不正确");
}

function loginLocked(decision: LoginRiskDecision) {
  const seconds = Math.max(1, Math.ceil((decision.waitMs ?? 0) / 1000));
  const message = decision.reason === "locked"
    ? `登录失败次数过多，请 ${Math.ceil(seconds / 60)} 分钟后再试`
    : `请求过于频繁，请 ${seconds} 秒后再试`;
  return new AuthError("LOGIN_LOCKED", message, 429);
}

function captchaRequired(message = "请完成验证码") {
  return new AuthError("CAPTCHA_REQUIRED", message, 401);
}

function captchaMessageForRisk(decision: LoginRiskDecision) {
  if (decision.reason === "failed_password") return "账号或密码不正确";
  return "请完成验证码";
}

export async function login(input: unknown, meta: {
  ip?: string;
  userAgent?: string | string[];
  clientRisk?: string;
  forwardedFor?: string;
  forwarded?: string;
  realIp?: string;
  via?: string;
} = {}) {
  const body = loginPayloadSchema.parse(input);
  const password = body.password;
  const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.username, body.username)).limit(1));
  const riskInput = { username: body.username, scope: user?.role === "admin" ? "admin" as const : "user" as const, ip: meta.ip };
  const risk = await assessLoginRisk(riskInput);
  if (risk.lockedUntil || risk.waitMs) {
    throw loginLocked(risk);
  }
  if (!user) {
    await recordLoginFailure(riskInput);
    throw invalidCredentials();
  }
  if (user.status !== "active") {
    await recordLoginFailure(riskInput);
    throw invalidCredentials();
  }

  if (risk.captchaRequired) {
    if (!body.captchaId || !body.captchaCode || !(await verifyCaptcha(body.captchaId, body.captchaCode))) {
      throw captchaRequired(body.captchaId || body.captchaCode ? "验证码不正确或已过期，请重新输入" : captchaMessageForRisk(risk));
    }
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const nextRisk = await recordLoginFailure(riskInput);
    if (nextRisk.captchaRequired) throw captchaRequired("账号或密码不正确");
    throw invalidCredentials();
  }

  const needsAdminSecondFactor = user.role === "admin" && risk.failures >= ADMIN_TOTP_AFTER_FAILURES;
  if (needsAdminSecondFactor && !(await verifyAdminSecondFactor(user, body.otp, body.recoveryCode))) {
    throw new AuthError("TOTP_REQUIRED", "需要管理员 OTP 验证", 401);
  }

  await recordLoginSuccess(riskInput);
  await cleanupExpiredAuthSessions();
  const sessionUser = publicUser(user);
  return { ...await createAuthSession(sessionUser), user: publicUser(user, meta.ip) };
}

export async function register(input: unknown) {
  const body = registerPayloadSchema.parse(input);
  if (!body.captchaId || !body.captchaCode || !(await verifyCaptcha(body.captchaId, body.captchaCode))) {
    throw new BadRequestError("验证码不正确或已过期", "CAPTCHA_INVALID");
  }

  const password = body.password;
  const validationMessage = validateUserRegistration(body.username, password);
  if (validationMessage) {
    throw new BadRequestError(validationMessage, "INVALID_REGISTRATION");
  }

  const passwordHash = await hashPassword(password);
  const result = await dbTransaction(async (tx) => {
    const invite = await dbGet<typeof invites.$inferSelect>(tx
      .select()
      .from(invites)
      .where(and(eq(invites.code, body.inviteCode.toUpperCase()), eq(invites.status, "unused")))
      .limit(1));

    if (!invite || invite.usedAt || invite.expireAt && invite.expireAt.getTime() <= Date.now()) {
      throw new BadRequestError("注册卡密不存在、已使用或已过期", "INVITE_INVALID");
    }

    const exists = await dbGet<{ id: number }>(tx.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1));
    if (exists) {
      throw new BadRequestError("注册失败，请更换账号或稍后重试", "USERNAME_UNAVAILABLE");
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
      throw new BadRequestError("注册卡密已被使用，请更换卡密", "INVITE_USED");
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
    throw new BadRequestError("当前密码不正确", "CURRENT_PASSWORD_INVALID");
  }

  const validationMessage = validatePassword(newPassword);
  if (validationMessage) throw new BadRequestError(validationMessage, "INVALID_PASSWORD");

  const passwordHash = await hashPassword(newPassword);
  await dbRun(db.update(users).set({ passwordHash, updatedAt: now() }).where(eq(users.id, userId)));
  await clearLoginFailuresForUsername(user.username);
  await revokeUserAuthSessions(userId);
}
