import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db, dbGet, dbRun } from "../../db/client.js";
import { dangerVerifications, users } from "../../db/schema.js";
import { now } from "../../utils/date.js";
import { verifyPassword } from "../../utils/password.js";
import { verifyAdminSecondFactor } from "./totp.service.js";

const DANGER_TTL_MS = 5 * 60 * 1000;

export const dangerVerificationSchema = z.object({
  dangerPassword: z.string().min(1).max(128).optional(),
  dangerOtp: z.string().trim().min(4).max(16).optional(),
  dangerRecoveryCode: z.string().trim().min(6).max(32).optional(),
  password: z.string().min(1).max(128).optional(),
  otp: z.string().trim().min(4).max(16).optional(),
  recoveryCode: z.string().trim().min(6).max(32).optional()
});

async function cleanupDangerVerifications() {
  await dbRun(db.delete(dangerVerifications).where(lt(dangerVerifications.expireAt, now())));
}

export async function hasFreshDangerVerification(userId: number, sessionId: string) {
  await cleanupDangerVerifications();
  const row = await dbGet<typeof dangerVerifications.$inferSelect>(db
    .select()
    .from(dangerVerifications)
    .where(and(eq(dangerVerifications.userId, userId), eq(dangerVerifications.sessionId, sessionId)))
    .limit(1));
  return !!row && row.expireAt.getTime() > Date.now();
}

export async function verifyDangerOperation(userId: number, sessionId: string, input: unknown) {
  const body = dangerVerificationSchema.parse(input ?? {});
  const password = body.dangerPassword ?? body.password ?? "";
  const otp = body.dangerOtp ?? body.otp;
  const recoveryCode = body.dangerRecoveryCode ?? body.recoveryCode;
  const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, userId)).limit(1));
  if (!user || user.status !== "active" || user.role !== "admin") throw new Error("Permission denied.");
  if (!password || !(await verifyPassword(password, user.passwordHash))) throw new Error("Danger verification failed.");
  if (!(await verifyAdminSecondFactor(user, otp, recoveryCode))) throw new Error("Danger verification failed.");

  const verifiedAt = now();
  const expireAt = new Date(Date.now() + DANGER_TTL_MS);
  const existing = await dbGet<{ id: number }>(db
    .select({ id: dangerVerifications.id })
    .from(dangerVerifications)
    .where(eq(dangerVerifications.sessionId, sessionId))
    .limit(1));
  if (existing) {
    await dbRun(db.update(dangerVerifications).set({ userId, verifiedAt, expireAt }).where(eq(dangerVerifications.id, existing.id)));
  } else {
    await dbRun(db.insert(dangerVerifications).values({ userId, sessionId, verifiedAt, expireAt }));
  }
  return { ok: true, expireAt };
}

export async function requireDangerVerification(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user;
  if (!user?.id || !user.sessionId) {
    return reply.code(401).send({ code: "SESSION_EXPIRED", message: "Session expired." });
  }
  if (await hasFreshDangerVerification(user.id, user.sessionId)) return;

  try {
    const body = dangerVerificationSchema.parse(request.body ?? {});
    if ((body.dangerPassword || body.password) && await verifyDangerOperation(user.id, user.sessionId, body)) return;
  } catch {
    return reply.code(403).send({ code: "DANGER_VERIFICATION_REQUIRED", message: "Danger verification required." });
  }

  return reply.code(403).send({ code: "DANGER_VERIFICATION_REQUIRED", message: "Danger verification required." });
}
