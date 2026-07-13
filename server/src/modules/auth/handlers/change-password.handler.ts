/**
 * @fileoverview 修改密码处理器
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import { changePassword } from "../auth.service.js";
import { writeAuditLog } from "../../../utils/auditLog.js";
import { auditMetaFromRequest } from "../../../utils/auditLog.js";

export async function changePasswordHandler(request: FastifyRequest, reply: FastifyReply) {
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
}
