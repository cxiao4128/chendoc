import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db, dbGet } from "../db/client.js";
import { users } from "../db/schema.js";
import type { JwtUser } from "../config/jwt.js";
import { verifyAuthSessionHeader } from "../modules/auth/session.service.js";
import { isSuperAdminUser } from "../utils/superAdmin.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtUser;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header) {
    return reply.code(401).send({ code: "SESSION_EXPIRED", message: "未登录或登录已过期" });
  }

  try {
    const session = await verifyAuthSessionHeader(Array.isArray(header) ? header[0]! : header);
    const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, session.userId)).limit(1));
    if (!user) {
      return reply.code(401).send({ code: "USER_NOT_FOUND", message: "账号不存在或已被注销" });
    }
    if (user.status !== "active") {
      return reply.code(401).send({ code: "USER_DISABLED", message: "你已被管理员禁止登录" });
    }
    request.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      isSuperAdmin: isSuperAdminUser(user),
      sessionId: session.sessionId
    };
  } catch {
    return reply.code(401).send({ code: "SESSION_EXPIRED", message: "未登录或登录已过期" });
  }
}
