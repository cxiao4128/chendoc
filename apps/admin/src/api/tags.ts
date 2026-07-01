// ChenDoc v2.10.0 - 标签 API 增强版
// 封装标签相关的 Gateway 请求

import { request } from "./request.js";

// 预设颜色（20 种）
export const TAG_COLORS = [
  // 蓝色系
  "#3b82f6", // 蓝色
  "#60a5fa", // 浅蓝
  "#1d4ed8", // 深蓝
  // 绿色系
  "#10b981", // 绿色
  "#34d399", // 浅绿
  "#059669", // 深绿
  // 黄色/橙色系
  "#f59e0b", // 橙色
  "#fbbf24", // 黄色
  "#d97706", // 深橙
  "#f97316", // 橙红
  // 红色系
  "#ef4444", // 红色
  "#f87171", // 浅红
  "#dc2626", // 深红
  // 紫色系
  "#8b5cf6", // 紫色
  "#a78bfa", // 浅紫
  "#6366f1", // 靛蓝
  // 其他
  "#ec4899", // 粉色
  "#06b6d4", // 青色
  "#84cc16", // 酸橙
  "#78716c", // 灰色
] as const;

// 预设图标（使用 Lucide 图标名称，避免 emoji）
export const TAG_ICONS = [
  "",           // 无图标
  "FileText",   // 文档
  "Folder",     // 文件夹
  "Star",       // 收藏
  "Heart",      // 喜欢
  "Flag",       // 标记
  "Book",       // 书籍
  "BookOpen",   // 阅读
  "Briefcase",  // 工作
  "Code",       // 代码
  "Database",   // 数据
  "Globe",      // 地球
  "Image",      // 图片
  "Music",      // 音乐
  "Video",      // 视频
  "Camera",     // 相机
  "Lock",       // 锁定
  "Mail",       // 邮件
  "Phone",      // 电话
  "Settings",   // 设置
  "Tag",        // 标签
  "Zap",        // 闪电
  "Lightbulb",  // 灯泡
  "Rocket",     // 火箭
  "Target",     // 目标
] as const;

export type TagColor = typeof TAG_COLORS[number];

export interface Tag {
  id: number;
  name: string;
  color: string;
  icon?: string;        // Lucide 图标名称
  parentId: number | null;
  ownerId: number;
  docCount: number;
  createdAt: string;
}

export interface TagWithChildren extends Tag {
  children: TagWithChildren[];
}

export interface CreateTagInput {
  name: string;
  color?: string;
  icon?: string;
  parentId?: number;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
  icon?: string;
  parentId?: number | null;
}

export interface TagStats {
  tagId: number;
  tagName: string;
  docCount: number;
}

// 获取标签树形结构
export async function getTagTree(): Promise<TagWithChildren[]> {
  const res = await request<{ tags: TagWithChildren[] }>("/api/tags/tree");
  return res.tags || [];
}

// 获取用户所有标签（扁平）
export async function listTags(): Promise<Tag[]> {
  const res = await request<{ tags: Tag[] }>("/api/tags");
  return res.tags || [];
}

// 获取标签使用统计
export async function getTagStats(): Promise<TagStats[]> {
  const res = await request<{ stats: TagStats[] }>("/api/tags/stats");
  return res.stats || [];
}

// 获取单个标签
export async function getTag(id: number): Promise<Tag | null> {
  const res = await request<{ tag: Tag }>(`/api/tags/${id}`);
  return res.tag || null;
}

// 创建标签（支持父子关系）
export async function createTag(input: CreateTagInput): Promise<Tag> {
  const res = await request<{ tag: Tag }>("/api/tags", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.tag;
}

// 更新标签（支持修改父子关系）
export async function updateTag(id: number, input: UpdateTagInput): Promise<Tag> {
  const res = await request<{ tag: Tag }>(`/api/tags/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.tag;
}

// 重命名标签
export async function renameTag(id: number, newName: string): Promise<Tag> {
  const res = await request<{ tag: Tag }>(`/api/tags/${id}/rename`, {
    method: "POST",
    body: JSON.stringify({ name: newName }),
  });
  return res.tag;
}

// 删除标签
export async function deleteTag(id: number): Promise<void> {
  await request(`/api/tags/${id}`, { method: "DELETE" });
}

// 合并标签
export async function mergeTags(sourceTagId: number, targetTagId: number): Promise<{ mergedCount: number }> {
  const res = await request<{ success: boolean; mergedCount: number }>("/api/tags/merge", {
    method: "POST",
    body: JSON.stringify({ sourceTagId, targetTagId }),
  });
  return { mergedCount: res.mergedCount };
}

// 批量添加标签到文档
export async function addTagsToDocs(tagIds: number[], docIds: number[]): Promise<{ updated: number }> {
  const res = await request<{ updated: number }>("/api/tags/docs/add", {
    method: "POST",
    body: JSON.stringify({ tagIds, docIds }),
  });
  return { updated: res.updated };
}

// 批量从文档移除标签
export async function removeTagsFromDocs(tagIds: number[], docIds: number[]): Promise<{ updated: number }> {
  const res = await request<{ updated: number }>("/api/tags/docs/remove", {
    method: "POST",
    body: JSON.stringify({ tagIds, docIds }),
  });
  return { updated: res.updated };
}

// 获取可用颜色
export async function getTagColors(): Promise<string[]> {
  const res = await request<{ colors: string[] }>("/api/tags/colors");
  return res.colors || [];
}

// 验证颜色格式
export function isValidColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}