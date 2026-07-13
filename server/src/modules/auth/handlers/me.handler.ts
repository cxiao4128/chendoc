/**
 * @fileoverview 当前用户处理器
 */
import type { FastifyRequest } from "fastify";
import { getUserById } from "../auth.service.js";
import { clientIpFromRequest } from "../../../utils/requestIp.js";
import { isSuperAdminUser } from "../../../utils/superAdmin.js";

export async function meHandler(request: FastifyRequest) {
  const user = await getUserById(request.user!.id);
  if (!user) {
    return { code: "USER_NOT_FOUND", message: "账号不存在或已被注销", user: null };
  }
  return {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      isSuperAdmin: isSuperAdminUser(user),
      currentIp: clientIpFromRequest(request)
    }
  };
}
