/**
 * @fileoverview Auth 路由注册
 *
 * 职责：注册路由、挂载 middleware
 * 禁止：写业务逻辑（放 handlers/）
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { loginRateLimit, registerRateLimit } from "../../middleware/rateLimit.js";
import { verifyAuthSessionToken } from "./session.service.js";
import { requireDangerVerification } from "./dangerVerification.service.js";
import { getTotpStatus, beginTotpSetup, enableTotp, disableTotp, regenerateRecoveryCodes } from "./totp.service.js";
import { verifyDangerOperation } from "./dangerVerification.service.js";
import { writeAuditLog } from "../../utils/auditLog.js";
import { auditMetaFromRequest } from "../../utils/auditLog.js";
import { getUserById } from "./auth.service.js";
import { clientIpFromRequest } from "../../utils/requestIp.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";
import { env } from "../../config/env.js";
import {
  loginHandler,
  registerHandler,
  meHandler,
  refreshHandler,
  logoutHandler,
  changePasswordHandler
} from "./handlers/index.js";

export async function authRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];
  const dangerousAdmin = [authenticate, requireAdmin, requireDangerVerification];

  function clearSessionCookie() {
    const secure = new URL(env.publicSiteUrl).protocol === "https:" ? "; Secure" : "";
    return `chendoc_session=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
  }

  function cookieToken(request: FastifyRequest) {
    const cookie = request.headers.cookie || "";
    const match = cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith("chendoc_session="));
    if (!match) return "";
    try { return decodeURIComponent(match.slice("chendoc_session=".length)); } catch { return ""; }
  }

  // 登录路由
  app.post("/api/auth/login", { config: { rateLimit: loginRateLimit } }, loginHandler);

  // 注册路由
  app.post("/api/auth/register", { config: { rateLimit: registerRateLimit } }, registerHandler);

  // 当前用户
  app.get("/api/auth/me", { preHandler: authenticate }, meHandler);
  app.post("/api/auth/me", { preHandler: authenticate }, meHandler);

  // 会话恢复（cookie）
  app.post("/api/auth/restore", async (request, reply) => {
    const token = cookieToken(request);
    if (!token) return reply.code(401).send({ code: "SESSION_NOT_FOUND", message: "登录状态不存在" });
    try {
      const session = await verifyAuthSessionToken(token);
      const user = await getUserById(session.userId);
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

  // 刷新令牌
  app.post("/api/auth/refresh", { preHandler: authenticate }, refreshHandler);

  // 登出
  app.post("/api/auth/logout", { preHandler: authenticate }, logoutHandler);

  // 修改密码
  app.post("/api/auth/change-password", { preHandler: authenticate }, changePasswordHandler);

  // TOTP 安全
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

  // 危险操作二次验证
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
