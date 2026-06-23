import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { loginRateLimit, registerRateLimit } from "../../middleware/rateLimit.js";
import { users } from "../../db/schema.js";
import { db, dbGet } from "../../db/client.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import { clientIpFromRequest } from "../../utils/requestIp.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";
import { AuthError, changePassword, login, register } from "./auth.service.js";
import { requireDangerVerification, verifyDangerOperation } from "./dangerVerification.service.js";
import { renewAuthSession, revokeAuthSession, verifyAuthSessionToken } from "./session.service.js";
import { env } from "../../config/env.js";
import {
  beginTotpSetup,
  disableTotp,
  enableTotp,
  getTotpStatus,
  regenerateRecoveryCodes
} from "./totp.service.js";

export async function authRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];
  const dangerousAdmin = [authenticate, requireAdmin, requireDangerVerification];
  async function currentUser(request: FastifyRequest) {
    const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, request.user!.id)).limit(1));
    if (!user) {
      return { code: "USER_NOT_FOUND", message: "账号不存在或已被注销", user: null };
    }
    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        isSuperAdmin: isSuperAdminUser(user),
        currentIp: clientIpFromRequest(request)
      }
    };
  }

  function cookieToken(request: FastifyRequest) {
    const cookie = request.headers.cookie || "";
    const match = cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith("chendoc_session="));
    if (!match) return "";
    try { return decodeURIComponent(match.slice("chendoc_session=".length)); } catch { return ""; }
  }

  function sessionCookie(token: string, expiresAt: Date | string) {
    const expireAt = new Date(expiresAt);
    const maxAge = Math.max(0, Math.floor((expireAt.getTime() - Date.now()) / 1000));
    const secure = new URL(env.publicSiteUrl).protocol === "https:" ? "; Secure" : "";
    return `chendoc_session=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
  }

  function clearSessionCookie() {
    const secure = new URL(env.publicSiteUrl).protocol === "https:" ? "; Secure" : "";
    return `chendoc_session=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
  }

  app.post("/api/auth/login", { config: { rateLimit: loginRateLimit } }, async (request, reply) => {
    try {
      const result = await login(request.body, {
        ip: clientIpFromRequest(request),
        userAgent: request.headers["user-agent"],
        clientRisk: Array.isArray(request.headers["x-client-risk"])
          ? request.headers["x-client-risk"][0]
          : request.headers["x-client-risk"],
        forwardedFor: Array.isArray(request.headers["x-forwarded-for"])
          ? request.headers["x-forwarded-for"][0]
          : request.headers["x-forwarded-for"],
        forwarded: Array.isArray(request.headers.forwarded)
          ? request.headers.forwarded[0]
          : request.headers.forwarded,
        realIp: Array.isArray(request.headers["x-real-ip"])
          ? request.headers["x-real-ip"][0]
          : request.headers["x-real-ip"],
        via: Array.isArray(request.headers.via)
          ? request.headers.via[0]
          : request.headers.via
      });
      await writeAuditLog({
        userId: result.user.id,
        action: "auth.login.success",
        targetType: "auth",
        targetId: "login",
        ...auditMetaFromRequest(request),
        role: result.user.role
      });
      reply.header("Set-Cookie", sessionCookie(result.token, result.expiresAt));
      return { token: result.token, user: result.user, expiresAt: result.expiresAt };
    } catch (error) {
      await writeAuditLog({
        userId: null,
        action: "auth.login.failure",
        targetType: "auth",
        targetId: "login",
        result: "failure",
        statusCode: error instanceof AuthError ? error.statusCode : 401,
        ...auditMetaFromRequest(request)
      });
      if (error instanceof AuthError) {
        return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      }
      return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "账号或密码不正确" });
    }
  });

  app.post("/api/auth/register", { config: { rateLimit: registerRateLimit } }, async (request, reply) => {
    try {
      const result = await register(request.body);
      await writeAuditLog({
        userId: result.user.id,
        action: "auth.register.success",
        targetType: "user",
        targetId: result.user.id,
        ...auditMetaFromRequest(request)
      });
      return result;
    } catch (error) {
      await writeAuditLog({
        userId: null,
        action: "auth.register.failure",
        targetType: "auth",
        targetId: "register",
        ...auditMetaFromRequest(request)
      });
      return reply.code(400).send({ message: error instanceof Error ? error.message : "注册失败" });
    }
  });

  app.get("/api/auth/me", { preHandler: authenticate }, async (request) => currentUser(request));

  app.post("/api/auth/me", { preHandler: authenticate }, async (request) => currentUser(request));

  app.post("/api/auth/restore", async (request, reply) => {
    const token = cookieToken(request);
    if (!token) return reply.code(401).send({ code: "SESSION_NOT_FOUND", message: "登录状态不存在" });
    try {
      const session = await verifyAuthSessionToken(token);
      const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, session.userId)).limit(1));
      if (!user || user.status !== "active") throw new Error("User is unavailable.");
      return {
        token,
        expiresAt: session.tokenExpiresAt,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
          isSuperAdmin: isSuperAdminUser(user),
          currentIp: clientIpFromRequest(request)
        }
      };
    } catch {
      reply.header("Set-Cookie", clearSessionCookie());
      return reply.code(401).send({ code: "SESSION_EXPIRED", message: "登录状态已失效" });
    }
  });

  app.post("/api/auth/refresh", { preHandler: authenticate }, async (request, reply) => {
    const current = await currentUser(request);
    if (!current.user) return current;
    const { currentIp: _currentIp, ...sessionUser } = current.user;
    const session = await renewAuthSession(
      request.user!.sessionId!,
      sessionUser,
      request.user!.sessionTokenDigest ?? ""
    );
    reply.header("Set-Cookie", sessionCookie(session.token, session.expiresAt));
    return { token: session.token, user: current.user, expiresAt: session.expiresAt };
  });

  app.post("/api/auth/logout", { preHandler: authenticate }, async (request, reply) => {
    await revokeAuthSession(request.user!.sessionId!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "auth.logout",
      targetType: "auth",
      targetId: "logout",
      ...auditMetaFromRequest(request)
    });
    reply.header("Set-Cookie", clearSessionCookie());
    return { ok: true };
  });

  app.post("/api/auth/change-password", { preHandler: authenticate }, async (request, reply) => {
    try {
      await changePassword(request.user!.id, request.body);
      await writeAuditLog({
        userId: request.user!.id,
        action: "auth.password.change",
        targetType: "user",
        targetId: request.user!.id,
        ...auditMetaFromRequest(request)
      });
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : "修改密码失败" });
    }
  });

  app.get("/api/admin/security/totp/status", { preHandler: adminOnly }, async (request) => ({
    status: await getTotpStatus(request.user!.id)
  }));

  app.post("/api/admin/security/totp/setup", { preHandler: adminOnly }, async (request) => ({
    setup: await beginTotpSetup(request.user!.id)
  }));

  app.post("/api/admin/security/totp/enable", { preHandler: adminOnly }, async (request, reply) => {
    const body = z.object({
      otp: z.string().trim().min(4).max(16),
      setupToken: z.string().min(20).max(2048)
    }).parse(request.body);
    try {
      const result = await enableTotp(request.user!.id, body.otp, body.setupToken);
      await writeAuditLog({
        userId: request.user!.id,
        action: "auth.totp.enable",
        targetType: "auth",
        targetId: "totp",
        ...auditMetaFromRequest(request)
      });
      return result;
    } catch {
      return reply.code(400).send({ message: "OTP verification failed." });
    }
  });

  app.post("/api/admin/security/totp/disable", { preHandler: dangerousAdmin }, async (request) => {
    await disableTotp(request.user!.id);
    await writeAuditLog({
      userId: request.user!.id,
      action: "auth.totp.disable",
      targetType: "auth",
      targetId: "totp",
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });

  app.post("/api/admin/security/totp/recovery-codes", { preHandler: dangerousAdmin }, async (request) => ({
    recoveryCodes: await regenerateRecoveryCodes(request.user!.id)
  }));

  app.post("/api/admin/security/totp/reset", { preHandler: dangerousAdmin }, async (request) => ({
    setup: await beginTotpSetup(request.user!.id)
  }));

  app.post("/api/admin/security/danger-verify", { preHandler: adminOnly }, async (request, reply) => {
    try {
      const result = await verifyDangerOperation(request.user!.id, request.user!.sessionId!, request.body);
      await writeAuditLog({
        userId: request.user!.id,
        action: "admin.danger.verify",
        targetType: "auth",
        targetId: "danger",
        ...auditMetaFromRequest(request)
      });
      return result;
    } catch {
      return reply.code(403).send({ code: "DANGER_VERIFICATION_REQUIRED", message: "Danger verification required." });
    }
  });

  app.post("/api/security/danger-verify", { preHandler: authenticate }, async (request, reply) => {
    try {
      const result = await verifyDangerOperation(request.user!.id, request.user!.sessionId!, request.body);
      await writeAuditLog({
        userId: request.user!.id,
        action: "security.danger.verify",
        targetType: "auth",
        targetId: "danger",
        ...auditMetaFromRequest(request)
      });
      return result;
    } catch {
      return reply.code(403).send({ code: "DANGER_VERIFICATION_REQUIRED", message: "Danger verification required." });
    }
  });
}
