import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db, dbGet } from "../db/client.js";
import { users } from "../db/schema.js";
import { isSuperAdminUser } from "../utils/superAdmin.js";

export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.id) {
    return reply.code(401).send({ code: "SESSION_EXPIRED", message: "Session expired." });
  }
  const user = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, request.user.id)).limit(1));
  if (!user || user.status !== "active" || !isSuperAdminUser(user)) {
    return reply.code(403).send({ code: "SUPER_ADMIN_REQUIRED", message: "Super admin permission required." });
  }
  request.user = {
    ...request.user,
    id: user.id,
    username: user.username,
    role: user.role,
    isSuperAdmin: true
  };
}
