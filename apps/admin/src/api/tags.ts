// ChenDoc v2.10.0 - 标签 API 增强版
// 封装标签相关的 Gateway 请求

import { request } from "./request.js";

// 预设颜色
export const TAG_COLORS = [
  "#3b82f6", // 蓝色
  "#10b981", // 绿色
  "#f59e0b", // 橙色
  "#ef4444", // 红色
  "#8b5cf6", // 紫色
  "#ec4899", // 粉色
  "#06b6d4", // 青色
  "#6366f1", // 靛蓝
  "#84cc16", // 酸橙
  "#f97316", // 橙红
] as const;

export type TagColor = typeof TAG_COLORS[number];

export interface Tag {
  id: number;
  name: string;
  color: string;
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
  parentId?: number;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
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