/**
 * @fileoverview 会话刷新处理器
 */
import type { FastifyRequest, FastifyReply } from "fastify";
import { renewAuthSession } from "../session.service.js";
import { clientIpFromRequest } from "../../../utils/requestIp.js";
import { isSuperAdminUser } from "../../../utils/superAdmin.js";
import { getUserById } from "../auth.service.js";
import { env } from "../../../config/env.js";

export async function refreshHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await getUserById(request.user!.id);
  if (!user) return { code: "USER_NOT_FOUND", message: "账号不存在或已被注销", user: null };
  const currentUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    isSuperAdmin: isSuperAdminUser(user),
    currentIp: clientIpFromRequest(request)
  };
  const session = await renewAuthSession(
    request.user!.sessionId!,
    currentUser,
    request.user!.sessionTokenDigest ?? ""
  );
  const secure = new URL(env.publicSiteUrl).protocol === "https:" ? "; Secure" : "";
  const expireAt = new Date(session.expiresAt);
  const maxAge = Math.max(0, Math.floor((expireAt.getTime() - Date.now()) / 1000));
  reply.header("Set-Cookie", `chendoc_session=${encodeURIComponent(session.token)}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`);
  return { token: session.token, user: currentUser, expiresAt: session.expiresAt };
}
