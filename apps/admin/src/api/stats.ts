// ChenDoc v2.10.0 - 访问统计 API
// 封装访问统计相关的 Gateway 请求

import { request } from "./request.js";

export interface AccessLog {
  id: number;
  targetType: "doc" | "form";
  targetId: number;
  visitorHash?: string;
  ipHash?: string;
  userAgent?: string;
  device?: string;
  viewedAt: string;
}

export interface DeviceBreakdown {
  device: string;
  count: number;
}

export interface DailyView {
  date: string;
  count: number;
}

export interface AccessStats {
  totalViews: number;
  uniqueVisitors: number;
  deviceBreakdown: DeviceBreakdown[];
  recentViews: DailyView[];
}

// 获取访问统计
export async function getAccessStats(
  type: "doc" | "form",
  id: number,
  options?: { days?: number }
): Promise<AccessStats> {
  const days = options?.days || 30;
  const res = await request<{ stats: AccessStats }>(`/api/stats/${type}/${id}?days=${days}`);
  return res.stats;
}

// 获取最近访问记录
export async function getRecentAccess(
  type: "doc" | "form",
  id: number,
  options?: { limit?: number }
): Promise<AccessLog[]> {
  const limit = options?.limit || 50;
  const res = await request<{ logs: AccessLog[] }>(`/api/stats/${type}/${id}/recent?limit=${limit}`);
  return res.logs || [];
}

// 记录访问（公开接口，用于分享页）
export async function trackAccess(
  type: "doc" | "form",
  id: number,
  options?: {
    visitorHash?: string;
    device?: "desktop" | "mobile" | "tablet";
  }
): Promise<void> {
  await request("/api/stats/track", {
    method: "POST",
    body: JSON.stringify({
      type,
      id,
      visitorHash: options?.visitorHash,
      device: options?.device,
    }),
  });
}

// 格式化设备名称
export function formatDevice(device: string | undefined): string {
  if (!device) return "未知";
  const map: Record<string, string> = {
    desktop: "桌面端",
    mobile: "移动端",
    tablet: "平板",
    unknown: "未知",
  };
  return map[device] || device;
}

// 格式化数字
export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// 计算百分比
export function calculatePercent(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}