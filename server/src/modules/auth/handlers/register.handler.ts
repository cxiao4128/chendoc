/**
 * @fileoverview 注册处理器
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import { register } from "../auth.service.js";
import { writeAuditLog } from "../../../utils/auditLog.js";
import { auditMetaFromRequest } from "../../../utils/auditLog.js";

export async function registerHandler(request: FastifyRequest, reply: FastifyReply) {
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
}
