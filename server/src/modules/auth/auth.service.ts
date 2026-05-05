import { and, eq, isNull } from "drizzle-orm";
import { ZodError, z } from "zod";
import { db } from "../../db/client.js";
import { invites, users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { now } from "../../utils/date.js";
import { hashPassword, validateUserRegistration, verifyPassword } from "../../utils/password.js";
import { decryptSubmittedPassword, decryptSubmittedPayload } from "../crypto/crypto.service.js";
import { verifyCaptcha } from "../captcha/captcha.service.js";
import { cleanupExpiredAuthSessions, createAuthSession } from "./session.service.js";

export const encryptedRequestSchema = z.object({
  keyId: z.string().min(8),
  key: z.string().min(40),
  payload: z.string().min(40)
});

const loginPayloadSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  captchaId: z.string().min(8).optional(),
  captchaCode: z.string().min(4).max(8).optional()
});

const registerPayloadSchema = loginPayloadSchema.extend({
  inviteCode: z.string().trim().min(4).max(32)
});

export const encryptedPasswordSchema = z.object({
  username: z.string().trim().min(1).max(64),
  encryptedPassword: z.string().min(40),
  keyId: z.string().min(8),
  captchaId: z.string().min(8).optional(),
  captchaCode: z.string().min(4).max(8).optional()
});

export const registerSchema = registerPayloadSchema;

function parseEncryptedJson<T extends z.ZodTypeAny>(input: unknown, schema: T): z.infer<T> {
  const envelope = encryptedRequestSchema.parse(input);
  const plaintext = decryptSubmittedPayload(envelope);
  let decoded: unknown;
  try {
    decoded = JSON.parse(plaintext);
  } catch {
    throw new Error("Invalid encrypted payload");
  }
  return schema.parse(decoded);
}

function publicUser(user: { id: number; username: string; role: "admin" | "user"; status: string }) {
  return { id: user.id, username: user.username, role: user.role, status: user.status };
}

function canSkipLoginCaptcha(user: { username: string; role: "admin" | "user" }) {
  return user.role === "admin" && user.username.toLowerCase() === env.defaultAdminUsername.toLowerCase();
}

export async function login(input: unknown) {
  const body = parseEncryptedJson(input, loginPayloadSchema);
  const password = body.password;
  const user = db.select().from(users).where(eq(users.username, body.username)).limit(1).get();

  if (!user || user.status !== "active" || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("登录失败，请检查账号、密码或验证码");
  }

  if (!canSkipLoginCaptcha(user) && (!body.captchaId || !body.captchaCode || !verifyCaptcha(body.captchaId, body.captchaCode))) {
    throw new Error("登录失败，请检查账号、密码或验证码");
  }

  cleanupExpiredAuthSessions();
  return { ...createAuthSession(user.id), user: publicUser(user) };
}

export async function register(input: unknown) {
  const body = parseEncryptedJson(input, registerPayloadSchema);
  if (!body.captchaId || !body.captchaCode || !verifyCaptcha(body.captchaId, body.captchaCode)) {
    throw new Error("验证码不正确或已过期");
  }

  const password = body.password;
  const validationMessage = validateUserRegistration(body.username, password);
  if (validationMessage) {
    throw new Error(validationMessage);
  }

  const passwordHash = await hashPassword(password);
  const result = db.transaction((tx) => {
    const invite = tx
      .select()
      .from(invites)
      .where(and(eq(invites.code, body.inviteCode.toUpperCase()), eq(invites.status, "unused")))
      .limit(1)
      .get();

    if (!invite || invite.usedAt || invite.expireAt && invite.expireAt.getTime() <= Date.now()) {
      throw new Error("注册卡密不存在、已使用或已过期");
    }

    const exists = tx.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1).get();
    if (exists) {
      throw new Error("注册失败，请更换账号或稍后重试");
    }

    const createdAt = now();
    const insert = tx.insert(users).values({
      username: body.username,
      passwordHash,
      role: "user",
      status: "active",
      createdAt,
      updatedAt: createdAt
    }).run();

    const userId = Number(insert.lastInsertRowid);
    const inviteUpdate = tx.update(invites).set({
      status: "used",
      usedBy: userId,
      usedAt: now(),
      updatedAt: now()
    }).where(and(eq(invites.id, invite.id), eq(invites.status, "unused"), isNull(invites.usedAt))).run();
    if (inviteUpdate.changes !== 1) {
      throw new Error("注册卡密已被使用，请更换卡密");
    }

    return { userId };
  });

  const user = db.select().from(users).where(eq(users.id, result.userId)).limit(1).get();
  if (!user) {
    throw new Error("注册失败，请稍后重试");
  }
  return { user: publicUser(user) };
}

export async function changePassword(userId: number, currentEncryptedPassword: string, newEncryptedPassword: string, keyId: string) {
  const currentPassword = decryptSubmittedPassword(keyId, currentEncryptedPassword);
  const newPassword = decryptSubmittedPassword(keyId, newEncryptedPassword);
  const user = db.select().from(users).where(eq(users.id, userId)).limit(1).get();
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
  db.update(users).set({ passwordHash, updatedAt: now() }).where(eq(users.id, userId)).run();
}
