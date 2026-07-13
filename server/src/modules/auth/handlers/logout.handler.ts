/**
 * @fileoverview 登出处理器
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import { revokeAuthSession } from "../session.service.js";
import { writeAuditLog } from "../../../utils/auditLog.js";
import { auditMetaFromRequest } from "../../../utils/auditLog.js";
import { env } from "../../../config/env.js";

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply) {
  await revokeAuthSession(request.user!.sessionId!);
  await writeAuditLog({
    userId: request.user!.id,
    action: "auth.logout",
    targetType: "auth",
    targetId: "logout",
    ...auditMetaFromRequest(request)
  });
  const secure = new URL(env.publicSiteUrl).protocol === "https:" ? "; Secure" : "";
  reply.header("Set-Cookie", `chendoc_session=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  return { ok: true };
}
