/**
 * @fileoverview 登录处理器
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { login } from "../auth.service.js";
import { writeAuditLog } from "../../../utils/auditLog.js";
import { AuthError } from "../auth.service.js";
import { auditMetaFromRequest } from "../../../utils/auditLog.js";
import { env } from "../../../config/env.js";
import { clientIpFromRequest } from "../../../utils/requestIp.js";

export const loginBodySchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  captchaId: z.string().min(8).optional(),
  captchaCode: z.string().trim().min(1).max(8).optional(),
  otp: z.string().trim().min(4).max(16).optional(),
  recoveryCode: z.string().trim().min(6).max(32).optional()
});

function sessionCookie(token: string, expiresAt: Date | string) {
  const expireAt = new Date(expiresAt);
  const maxAge = Math.max(0, Math.floor((expireAt.getTime() - Date.now()) / 1000));
  const secure = new URL(env.publicSiteUrl).protocol === "https:" ? "; Secure" : "";
  return `chendoc_session=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function loginHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = loginBodySchema.parse(request.body);
  try {
    const result = await login(body, {
      ip: clientIpFromRequest(request),
      userAgent: request.headers["user-agent"],
      clientRisk: request.headers["x-client-risk"] as string | undefined,
      forwardedFor: request.headers["x-forwarded-for"] as string | undefined,
      forwarded: request.headers.forwarded as string | undefined,
      realIp: request.headers["x-real-ip"] as string | undefined,
      via: request.headers.via as string | undefined
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
}
