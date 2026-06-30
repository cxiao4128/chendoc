// ChenDoc v2.10.0 - 标签服务
// 提供标签的 CRUD 操作

import { db, dbAll, dbGet } from "../../db/client.js";
import { tags, docs } from "../../db/schema.js";
import { eq, and, desc } from "drizzle-orm";

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

export interface Tag {
  id: number;
  name: string;
  color: string;
  ownerId: number;
  docCount: number;
  createdAt: Date;
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
export async function listTags(ownerId: number): Promise<Tag[]> {
  const result = await dbAll(
    db.select().from(tags).where(eq(tags.ownerId, ownerId)).orderBy(desc(tags.docCount), tags.name)
  );
  return result.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    ownerId: t.ownerId,
    docCount: t.docCount,
    createdAt: t.createdAt,
  }));
}

// 获取单个标签
export async function getTag(id: number, ownerId: number): Promise<Tag | null> {
  const result = await dbGet(
    db.select().from(tags).where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))).limit(1)
  );
  if (!result) return null;
  return {
    id: result.id,
    name: result.name,
    color: result.color,
    ownerId: result.ownerId,
    docCount: result.docCount,
    createdAt: result.createdAt,
  };
}

// 创建标签
export async function createTag(ownerId: number, input: CreateTagInput): Promise<Tag> {
  const name = input.name.trim();
  const color = input.color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
  const now = new Date();

  const result = await db.insert(tags).values({
    name,
    color,
    ownerId,
    docCount: 0,
    createdAt: now,
  }).returning().execute();

  const t = result[0];
  return {
    id: t.id,
    name: t.name,
    color: t.color,
    ownerId: t.ownerId,
    docCount: t.docCount,
    createdAt: t.createdAt,
  };
}

// 更新标签
export async function updateTag(id: number, ownerId: number, input: UpdateTagInput): Promise<Tag | null> {
  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.color !== undefined) values.color = input.color;

  if (Object.keys(values).length === 0) {
    return getTag(id, ownerId);
  }

  const result = await db.update(tags).set(values).where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))).returning().execute();
  if (!result.length) return null;

  const t = result[0];
  return {
    id: t.id,
    name: t.name,
    color: t.color,
    ownerId: t.ownerId,
    docCount: t.docCount,
    createdAt: t.createdAt,
  };
}

// 删除标签
export async function deleteTag(id: number, ownerId: number): Promise<boolean> {
  const tag = await getTag(id, ownerId);
  if (!tag) return false;

  // 获取使用此标签的所有文档并移除标签
  const taggedDocs = await dbAll(
    db.select({ id: docs.id, tags: docs.tags }).from(docs).where(eq(docs.ownerId, ownerId))
  );

  for (const doc of taggedDocs) {
    try {
      const docTags: string[] = JSON.parse(doc.tags || "[]");
      if (docTags.includes(tag.name)) {
        const updatedTags = docTags.filter((t) => t !== tag.name);
        await db.update(docs).set({ tags: JSON.stringify(updatedTags) }).where(eq(docs.id, doc.id)).execute();
      }
    } catch {
      // 忽略解析错误
    }
  }

  const result = await db.delete(tags).where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))).returning().execute();
  return result.length > 0;
}
