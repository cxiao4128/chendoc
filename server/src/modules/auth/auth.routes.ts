import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { authenticate } from "../../middleware/auth.js";
import { loginRateLimit, registerRateLimit } from "../../middleware/rateLimit.js";
import { users } from "../../db/schema.js";
import { db, dbGet } from "../../db/client.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";
import { AuthError, changePassword, login, register } from "./auth.service.js";

export async function authRoutes(app: FastifyInstance) {
  async function currentUser(request: FastifyRequest) {
    const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, request.user!.id)).limit(1));
    if (!user) {
      return { code: "USER_NOT_FOUND", message: "账号不存在或已被注销", user: null };
    }
    return { user: { id: user.id, username: user.username, role: user.role, status: user.status, isSuperAdmin: isSuperAdminUser(user) } };
  }

  app.post("/api/auth/login", { config: { rateLimit: loginRateLimit } }, async (request, reply) => {
    try {
      return await login(request.body);
    } catch (error) {
      await writeAuditLog({
        userId: null,
        action: "auth.login.failure",
        targetType: "auth",
        targetId: "login",
        ...auditMetaFromRequest(request)
      });
      if (error instanceof AuthError) {
        return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      }
      return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "登录失败，请检查账号、密码或验证码" });
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
}
