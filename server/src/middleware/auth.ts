import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
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
    return reply.code(401).send({ message: "未登录或登录已过期" });
  }

  try {
    const session = verifyAuthSessionHeader(header);
    const user = db.select().from(users).where(eq(users.id, session.userId)).limit(1).get();
    if (!user || user.status !== "active") {
      return reply.code(401).send({ message: "未登录或登录已过期" });
    }
    request.user = { id: user.id, username: user.username, role: user.role, isSuperAdmin: isSuperAdminUser(user) };
  } catch {
    return reply.code(401).send({ message: "未登录或登录已过期" });
  }
}
