// ChenDoc v2.10.0 - 访问统计服务
// 记录和查询文档/表单访问统计

import { db, dbAll, dbRun } from "../../db/client.js";
import { accessLogs } from "../../db/schema.js";
import { eq, and, sql, gte, desc } from "drizzle-orm";

export interface AccessLog {
  id: number;
  targetType: "doc" | "form";
  targetId: number;
  visitorHash?: string;
  ipHash?: string;
  userAgent?: string;
  device?: string;
  viewedAt: Date;
}

export interface AccessStats {
  totalViews: number;
  uniqueVisitors: number;  // 基于 IP，同一 IP 多次访问只计一次
  deviceBreakdown: { device: string; count: number }[];
  recentViews: { date: string; count: number }[];
}

// 记录访问
export async function recordAccess(
  targetType: "doc" | "form",
  targetId: number,
  options?: {
    visitorHash?: string;
    ipHash?: string;
    userAgent?: string;
    device?: string;
  }
): Promise<void> {
  await db.insert(accessLogs).values({
    targetType,
    targetId,
    visitorHash: options?.visitorHash,
    ipHash: options?.ipHash,
    userAgent: options?.userAgent,
    device: options?.device,
    viewedAt: new Date(),
  }).execute();
}

// 获取访问统计
export async function getAccessStats(
  targetType: "doc" | "form",
  targetId: number,
  days: number = 30
): Promise<AccessStats> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // 总访问量（每次访问都计入）
  const totalResult = await dbAll(
    db.select({ count: sql<number>`count(*)` })
      .from(accessLogs)
      .where(and(
        eq(accessLogs.targetType, targetType),
        eq(accessLogs.targetId, targetId),
        gte(accessLogs.viewedAt, cutoff)
      ))
  );
  const totalViews = totalResult[0]?.count || 0;

  // 独立访客数（基于 IP，同一 IP 只计一次）
  // 注意：ipHash 可能为 null，只有记录了 ipHash 的才算有效独立访客
  const uniqueResult = await dbAll(
    db.select({ count: sql<number>`count(distinct ${accessLogs.ipHash})` })
      .from(accessLogs)
      .where(and(
        eq(accessLogs.targetType, targetType),
        eq(accessLogs.targetId, targetId),
        gte(accessLogs.viewedAt, cutoff),
        sql`${accessLogs.ipHash} IS NOT NULL`
      ))
  );
  const uniqueVisitors = uniqueResult[0]?.count || 0;

  // 设备分布（基于首次访问的设备类型去重）
  const deviceResult = await dbAll(
    sql<{ device: string | null; count: number }>`
      SELECT device, count(*) as count FROM (
        SELECT device, ip_hash,
               ROW_NUMBER() OVER (PARTITION BY ip_hash ORDER BY viewed_at ASC) as rn
        FROM access_logs
        WHERE target_type = ${targetType}
          AND target_id = ${targetId}
          AND viewed_at >= ${cutoff.toISOString()}
          AND ip_hash IS NOT NULL
      ) WHERE rn = 1
      GROUP BY device
      ORDER BY count DESC
    `
  );
  const deviceBreakdown = deviceResult.map(r => ({
    device: r.device || "unknown",
    count: Number(r.count)
  }));

  // 每日趋势（每天有多少独立 IP 访问）
  const recentResult = await dbAll(
    sql<{ date: string; count: number }>`
      SELECT
        strftime('%Y-%m-%d', viewed_at) as date,
        count(DISTINCT ip_hash) as count
      FROM access_logs
      WHERE target_type = ${targetType}
        AND target_id = ${targetId}
        AND viewed_at >= ${cutoff.toISOString()}
        AND ip_hash IS NOT NULL
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `
  );
  const recentViews = recentResult.map(r => ({
    date: r.date,
    count: Number(r.count)
  }));

  return {
    totalViews,
    uniqueVisitors,
    deviceBreakdown,
    recentViews: recentViews.reverse(), // 按日期升序
  };
}

// 获取最近的访问记录
export async function getRecentAccess(
  targetType: "doc" | "form",
  targetId: number,
  limit: number = 50
): Promise<AccessLog[]> {
  const result = await dbAll(
    db.select()
      .from(accessLogs)
      .where(and(
        eq(accessLogs.targetType, targetType),
        eq(accessLogs.targetId, targetId)
      ))
      .orderBy(desc(accessLogs.viewedAt))
      .limit(limit)
  );

  return result.map(r => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    visitorHash: r.visitorHash || undefined,
    ipHash: r.ipHash || undefined,
    userAgent: r.userAgent || undefined,
    device: r.device || undefined,
    viewedAt: r.viewedAt,
  }));
}

// 清理过期数据（保留 90 天）
export async function cleanupOldAccessLogs(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const result = await dbRun(
    db.delete(accessLogs)
      .where(sql`${accessLogs.viewedAt} < ${cutoff.toISOString()}`)
  );

  return result.changes || 0;
}