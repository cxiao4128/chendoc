// ChenDoc v2.10.0 - 访问统计路由
// 提供访问统计的查询接口

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { getAccessStats, getRecentAccess } from "./stats.service.js";
import crypto from "node:crypto";

export async function statsRoutes(app: FastifyInstance) {
  // 认证中间件
  const authHandler = [authenticate];

  // 获取访问统计
  app.get("/api/stats/:type/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({
      type: z.enum(["doc", "form"]),
      id: z.coerce.number().int().positive(),
    }).parse(request.params);

    const query = z.object({
      days: z.coerce.number().int().positive().max(365).default(30),
    }).parse(request.query || {});

    const stats = await getAccessStats(params.type as "doc" | "form", params.id, query.days);
    return { stats };
  });

  // 获取最近访问记录
  app.get("/api/stats/:type/:id/recent", { preHandler: authHandler }, async (request) => {
    const params = z.object({
      type: z.enum(["doc", "form"]),
      id: z.coerce.number().int().positive(),
    }).parse(request.params);

    const query = z.object({
      limit: z.coerce.number().int().positive().max(200).default(50),
    }).parse(request.query || {});

    const logs = await getRecentAccess(params.type as "doc" | "form", params.id, query.limit);
    return { logs };
  });

  // 公开访问接口（用于分享页面）
  app.post("/api/stats/track", async (request) => {
    const body = z.object({
      type: z.enum(["doc", "form"]),
      id: z.coerce.number().int().positive(),
      visitorHash: z.string().optional(),
      device: z.enum(["desktop", "mobile", "tablet"]).optional(),
    }).parse(request.body || {});

    // 生成 IP 哈希（不可逆）
    const ipHash = request.ip
      ? crypto.createHash("sha256").update(request.ip + "chendoc-salt").digest("hex").slice(0, 32)
      : undefined;

    // 生成访客哈希
    const visitorHash = body.visitorHash
      || crypto.createHash("sha256").update(request.headers["user-agent"] || "").digest("hex").slice(0, 32);

    // 检测设备类型
    const userAgent = request.headers["user-agent"] || "";
    let device = body.device;
    if (!device) {
      if (/mobile|android|iphone/i.test(userAgent)) {
        device = "mobile";
      } else if (/tablet|ipad/i.test(userAgent)) {
        device = "tablet";
      } else {
        device = "desktop";
      }
    }

    // 导入 recordAccess
    const { recordAccess } = await import("./stats.service.js");
    await recordAccess(body.type as "doc" | "form", body.id, {
      visitorHash,
      ipHash,
      userAgent,
      device,
    });

    return { success: true };
  });
}
