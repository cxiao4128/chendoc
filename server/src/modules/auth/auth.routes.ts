import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { authenticate } from "../../middleware/auth.js";
import { loginRateLimit, registerRateLimit } from "../../middleware/rateLimit.js";
import { users } from "../../db/schema.js";
import { db } from "../../db/client.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";
import { changePassword, login, register } from "./auth.service.js";
import { encryptResponse } from "../crypto/crypto.service.js";

function getResponsePublicKey(request: FastifyRequest) {
  const header = request.headers["x-response-public-key"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    throw new Error("Missing response public key");
  }

  const publicKey = Buffer.from(value, "base64").toString("utf8");
  if (!publicKey.includes("BEGIN PUBLIC KEY")) {
    throw new Error("Invalid response public key");
  }
  return publicKey;
}

function encrypted(request: FastifyRequest, payload: unknown) {
  return encryptResponse(getResponsePublicKey(request), payload);
}

function sendEncrypted(reply: FastifyReply, request: FastifyRequest, status: number, payload: unknown) {
  try {
    return reply.code(status).send(encrypted(request, payload));
  } catch {
    return reply.code(status).send(payload);
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", { config: { rateLimit: loginRateLimit } }, async (request, reply) => {
    try {
      return encrypted(request, await login(request.body));
    } catch {
      writeAuditLog({
        userId: null,
        action: "auth.login.failure",
        targetType: "auth",
        targetId: "login",
        ...auditMetaFromRequest(request)
      });
      return sendEncrypted(reply, request, 401, { message: "登录失败，请检查账号、密码或验证码" });
    }
  });

  app.post("/api/auth/register", { config: { rateLimit: registerRateLimit } }, async (request, reply) => {
    try {
      const result = await register(request.body);
      writeAuditLog({
        userId: result.user.id,
        action: "auth.register.success",
        targetType: "user",
        targetId: result.user.id,
        ...auditMetaFromRequest(request)
      });
      return encrypted(request, result);
    } catch (error) {
      writeAuditLog({
        userId: null,
        action: "auth.register.failure",
        targetType: "auth",
        targetId: "register",
        ...auditMetaFromRequest(request)
      });
      return sendEncrypted(reply, request, 400, { message: error instanceof Error ? error.message : "注册失败" });
    }
  });

  app.get("/api/auth/me", { preHandler: authenticate }, async (request) => {
    const user = db.select().from(users).where(eq(users.id, request.user!.id)).limit(1).get();
    if (!user) {
      return encrypted(request, { user: null });
    }
    return encrypted(request, { user: { id: user.id, username: user.username, role: user.role, status: user.status, isSuperAdmin: isSuperAdminUser(user) } });
  });

  app.post("/api/auth/change-password", { preHandler: authenticate }, async (request, reply) => {
    const body = z.object({
      currentEncryptedPassword: z.string().min(40),
      newEncryptedPassword: z.string().min(40),
      keyId: z.string().min(8)
    }).parse(request.body);
    try {
      await changePassword(request.user!.id, body.currentEncryptedPassword, body.newEncryptedPassword, body.keyId);
      writeAuditLog({
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
}
