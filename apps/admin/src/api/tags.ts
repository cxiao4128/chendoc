// ChenDoc v2.10.0 - 标签 API
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
] as const;

export type TagColor = typeof TAG_COLORS[number];

export interface Tag {
  id: number;
  name: string;
  color: string;
  ownerId: number;
  docCount: number;
  createdAt: string;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

// 获取用户所有标签
export async function listTags(): Promise<Tag[]> {
  const res = await request<{ tags: Tag[] }>("/api/tags");
  return res.tags || [];
}

// 获取单个标签
export async function getTag(id: number): Promise<Tag | null> {
  const res = await request<{ tag: Tag }>(`/api/tags/${id}`);
  return res.tag || null;
}

// 创建标签
export async function createTag(input: CreateTagInput): Promise<Tag> {
  const res = await request<{ tag: Tag }>("/api/tags", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.tag;
}

// 更新标签
export async function updateTag(id: number, input: UpdateTagInput): Promise<Tag> {
  const res = await request<{ tag: Tag }>(`/api/tags/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.tag;
}

// 删除标签
export async function deleteTag(id: number): Promise<void> {
  await request(`/api/tags/${id}`, { method: "DELETE" });
}

// 获取可用颜色
export async function getTagColors(): Promise<string[]> {
  const res = await request<{ colors: string[] }>("/api/tags/colors");
  return res.colors || [];
}
