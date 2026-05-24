import { and, eq, isNull } from "drizzle-orm";
import { ZodError, z } from "zod";
import { db, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { invites, users } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { now } from "../../utils/date.js";
import { hashPassword, validateUserRegistration, verifyPassword } from "../../utils/password.js";
import { decryptSubmittedPassword, decryptSubmittedPayload } from "../crypto/crypto.service.js";
import { verifyCaptcha } from "../captcha/captcha.service.js";
import { cleanupExpiredAuthSessions, createAuthSession } from "./session.service.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";

export const encryptedRequestSchema = z.object({
  keyId: z.string().min(8),
  key: z.string().min(40),
  payload: z.string().min(40)
});

const loginPayloadSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  captchaId: z.string().min(8).optional(),
  captchaCode: z.string().trim().min(1).max(8).optional()
});

const registerPayloadSchema = loginPayloadSchema.extend({
  inviteCode: z.string().trim().min(4).max(32)
});

export const encryptedPasswordSchema = z.object({
  username: z.string().trim().min(1).max(64),
  encryptedPassword: z.string().min(40),
  keyId: z.string().min(8),
  captchaId: z.string().min(8).optional(),
  captchaCode: z.string().trim().min(1).max(8).optional()
});

export const registerSchema = registerPayloadSchema;

async function parseEncryptedJson<T extends z.ZodTypeAny>(input: unknown, schema: T): Promise<z.infer<T>> {
  const envelope = encryptedRequestSchema.parse(input);
  const plaintext = await decryptSubmittedPayload(envelope);
  let decoded: unknown;
  try {
    decoded = JSON.parse(plaintext);
  } catch {
    throw new Error("Invalid encrypted payload");
  }
  return schema.parse(decoded);
}

function publicUser(user: { id: number; username: string; role: "admin" | "user"; status: string }) {
  return { id: user.id, username: user.username, role: user.role, status: user.status, isSuperAdmin: isSuperAdminUser(user) };
}

function canSkipLoginCaptcha(user: { username: string; role: "admin" | "user" }) {
  return user.role === "admin" && user.username.toLowerCase() === env.defaultAdminUsername.toLowerCase();
}

export async function login(input: unknown) {
  const body = await parseEncryptedJson(input, loginPayloadSchema);
  const password = body.password;
  const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.username, body.username)).limit(1));
  const shouldSkipCaptcha = user ? canSkipLoginCaptcha(user) : false;

  if (!shouldSkipCaptcha && (!body.captchaId || !body.captchaCode || !(await verifyCaptcha(body.captchaId, body.captchaCode)))) {
    throw new Error("登录失败，请检查账号、密码或验证码");
  }

  if (!user || user.status !== "active" || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("登录失败，请检查账号、密码或验证码");
  }

  await cleanupExpiredAuthSessions();
  return { ...await createAuthSession(user.id), user: publicUser(user) };
}

export async function register(input: unknown) {
  const body = await parseEncryptedJson(input, registerPayloadSchema);
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

export async function changePassword(userId: number, currentEncryptedPassword: string, newEncryptedPassword: string, keyId: string) {
  const currentPassword = await decryptSubmittedPassword(keyId, currentEncryptedPassword);
  const newPassword = await decryptSubmittedPassword(keyId, newEncryptedPassword);
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
