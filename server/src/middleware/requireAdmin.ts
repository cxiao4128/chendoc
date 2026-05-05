import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user?.role !== "admin") {
    return reply.code(403).send({ message: "需要管理员权限" });
  }
}
