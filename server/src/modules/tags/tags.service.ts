// ChenDoc v2.10.0 - 标签服务增强版
// 提供标签的 CRUD、层级、批量操作、合并功能

import { db, dbAll, dbGet } from "../../db/client.js";
import { tags, tagHierarchy, docs } from "../../db/schema.js";
import { eq, and, desc, inArray, or } from "drizzle-orm";

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

// 自定义颜色验证
export function isValidColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  parentId: number | null;
  ownerId: number;
  docCount: number;
  createdAt: Date;
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

// 获取用户所有标签（扁平列表）
export async function listTags(ownerId: number): Promise<Tag[]> {
  const result = await dbAll(
    db.select().from(tags).where(eq(tags.ownerId, ownerId)).orderBy(desc(tags.docCount), tags.name)
  );
  return result.map(mapTag);
}

// 获取用户标签树形结构
export async function getTagTree(ownerId: number): Promise<TagWithChildren[]> {
  const allTags = await listTags(ownerId);
  const tagMap = new Map<number, TagWithChildren>();

  // 构建 map
  for (const tag of allTags) {
    tagMap.set(tag.id, { ...tag, children: [] });
  }

  const rootTags: TagWithChildren[] = [];

  // 构建树形结构
  for (const tag of allTags) {
    const tagWithChildren = tagMap.get(tag.id)!;
    if (tag.parentId === null) {
      rootTags.push(tagWithChildren);
    } else {
      const parent = tagMap.get(tag.parentId);
      if (parent) {
        parent.children.push(tagWithChildren);
      } else {
        // 父标签不存在，作为根标签
        rootTags.push(tagWithChildren);
      }
    }
  }

  return rootTags;
}

// 获取单个标签
export async function getTag(id: number, ownerId: number): Promise<Tag | null> {
  const result = await dbGet(
    db.select().from(tags).where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))).limit(1)
  );
  return result ? mapTag(result) : null;
}

// 创建标签
export async function createTag(ownerId: number, input: CreateTagInput): Promise<Tag> {
  const name = input.name.trim();
  const color = input.color && isValidColor(input.color) ? input.color : TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
  const now = new Date();

  // 验证 parentId 存在且属于当前用户
  let parentId: number | null = null;
  if (input.parentId) {
    const parent = await getTag(input.parentId, ownerId);
    if (parent) {
      parentId = input.parentId;
    }
  }

  const result = await db.insert(tags).values({
    name,
    color,
    parentId,
    ownerId,
    docCount: 0,
    createdAt: now,
  }).returning().execute();

  return mapTag(result[0]);
}

// 更新标签
export async function updateTag(id: number, ownerId: number, input: UpdateTagInput): Promise<Tag | null> {
  const existing = await getTag(id, ownerId);
  if (!existing) return null;

  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.color !== undefined && isValidColor(input.color)) values.color = input.color;
  if (input.parentId !== undefined) {
    // 防止循环引用
    if (input.parentId === id) {
      return null; // 不能将自己设为父标签
    }
    if (input.parentId !== null) {
      // 验证新父标签存在且不形成循环
      const isDescendant = await isDescendantOf(input.parentId, id, ownerId);
      if (isDescendant) return null; // 不能将后代设为父标签
      values.parentId = input.parentId;
    } else {
      values.parentId = null;
    }
  }

  if (Object.keys(values).length === 0) {
    return existing;
  }

  const result = await db.update(tags).set(values).where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))).returning().execute();
  return result.length > 0 ? mapTag(result[0]) : null;
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

  // 将子标签提升为根标签
  await db.update(tags).set({ parentId: null }).where(and(eq(tags.parentId, id), eq(tags.ownerId, ownerId))).execute();

  // 删除标签间的层级关系
  await db.delete(tagHierarchy).where(
    or(eq(tagHierarchy.parentTagId, id), eq(tagHierarchy.childTagId, id))
  ).execute();

  const result = await db.delete(tags).where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))).returning().execute();
  return result.length > 0;
}

// 检查目标标签是否是源标签的后代
async function isDescendantOf(targetId: number, sourceId: number, ownerId: number): Promise<boolean> {
  const children = await dbAll(
    db.select({ id: tags.id }).from(tags).where(and(eq(tags.parentId, sourceId), eq(tags.ownerId, ownerId)))
  );

  for (const child of children) {
    if (child.id === targetId) return true;
    if (await isDescendantOf(targetId, child.id, ownerId)) return true;
  }
  return false;
}

// 批量添加标签到文档
export async function addTagsToDocs(ownerId: number, tagIds: number[], docIds: number[]): Promise<{ updated: number }> {
  if (tagIds.length === 0 || docIds.length === 0) return { updated: 0 };

  // 获取标签名
  const tagRecords = await dbAll(
    db.select({ id: tags.id, name: tags.name }).from(tags).where(
      and(inArray(tags.id, tagIds), eq(tags.ownerId, ownerId))
    )
  );
  const tagNames = tagRecords.map((t) => t.name);

  let updated = 0;
  for (const docId of docIds) {
    const doc = await dbGet(db.select({ id: docs.id, tags: docs.tags }).from(docs).where(
      and(eq(docs.id, docId), eq(docs.ownerId, ownerId))
    ));
    if (!doc) continue;

    try {
      const docTags: string[] = JSON.parse(doc.tags || "[]");
      let changed = false;
      for (const tagName of tagNames) {
        if (!docTags.includes(tagName)) {
          docTags.push(tagName);
          changed = true;
        }
      }
      if (changed) {
        await db.update(docs).set({ tags: JSON.stringify(docTags) }).where(eq(docs.id, docId)).execute();
        updated++;
      }
    } catch {
      // 忽略解析错误
    }
  }

  return { updated };
}

// 批量从文档移除标签
export async function removeTagsFromDocs(ownerId: number, tagIds: number[], docIds: number[]): Promise<{ updated: number }> {
  if (tagIds.length === 0 || docIds.length === 0) return { updated: 0 };

  // 获取标签名
  const tagRecords = await dbAll(
    db.select({ id: tags.id, name: tags.name }).from(tags).where(
      and(inArray(tags.id, tagIds), eq(tags.ownerId, ownerId))
    )
  );
  const tagNames = tagRecords.map((t) => t.name);

  let updated = 0;
  for (const docId of docIds) {
    const doc = await dbGet(db.select({ id: docs.id, tags: docs.tags }).from(docs).where(
      and(eq(docs.id, docId), eq(docs.ownerId, ownerId))
    ));
    if (!doc) continue;

    try {
      const docTags: string[] = JSON.parse(doc.tags || "[]");
      const originalLength = docTags.length;
      const filteredTags = docTags.filter((t) => !tagNames.includes(t));
      if (filteredTags.length !== originalLength) {
        await db.update(docs).set({ tags: JSON.stringify(filteredTags) }).where(eq(docs.id, docId)).execute();
        updated++;
      }
    } catch {
      // 忽略解析错误
    }
  }

  return { updated };
}

// 合并标签（将源标签合并到目标标签）
export async function mergeTags(ownerId: number, sourceTagId: number, targetTagId: number): Promise<{ mergedCount: number } | null> {
  if (sourceTagId === targetTagId) return null;

  const sourceTag = await getTag(sourceTagId, ownerId);
  const targetTag = await getTag(targetTagId, ownerId);
  if (!sourceTag || !targetTag) return null;

  // 将所有使用源标签的文档更新为目标标签
  const taggedDocs = await dbAll(
    db.select({ id: docs.id, tags: docs.tags }).from(docs).where(eq(docs.ownerId, ownerId))
  );

  let mergedCount = 0;
  for (const doc of taggedDocs) {
    try {
      const docTags: string[] = JSON.parse(doc.tags || "[]");
      const sourceIndex = docTags.indexOf(sourceTag.name);
      if (sourceIndex !== -1) {
        // 如果目标标签已存在，只移除源标签
        if (!docTags.includes(targetTag.name)) {
          docTags[sourceIndex] = targetTag.name;
        } else {
          docTags.splice(sourceIndex, 1);
        }
        await db.update(docs).set({ tags: JSON.stringify(docTags) }).where(eq(docs.id, doc.id)).execute();
        mergedCount++;
      }
    } catch {
      // 忽略解析错误
    }
  }

  // 删除源标签
  await deleteTag(sourceTagId, ownerId);

  // 更新目标标签的 docCount
  await recalculateDocCount(targetTagId, ownerId);

  return { mergedCount };
}

// 重命名标签
export async function renameTag(ownerId: number, tagId: number, newName: string): Promise<Tag | null> {
  const tag = await getTag(tagId, ownerId);
  if (!tag) return null;

  const oldName = tag.name;
  if (oldName === newName.trim()) return tag;

  // 更新所有使用此标签的文档
  const taggedDocs = await dbAll(
    db.select({ id: docs.id, tags: docs.tags }).from(docs).where(eq(docs.ownerId, ownerId))
  );

  for (const doc of taggedDocs) {
    try {
      const docTags: string[] = JSON.parse(doc.tags || "[]");
      const index = docTags.indexOf(oldName);
      if (index !== -1) {
        docTags[index] = newName.trim();
        await db.update(docs).set({ tags: JSON.stringify(docTags) }).where(eq(docs.id, doc.id)).execute();
      }
    } catch {
      // 忽略解析错误
    }
  }

  return updateTag(tagId, ownerId, { name: newName.trim() });
}

// 获取标签使用统计
export async function getTagStats(ownerId: number): Promise<{ tagId: number; tagName: string; docCount: number }[]> {
  const allTags = await listTags(ownerId);
  return allTags.map((t) => ({ tagId: t.id, tagName: t.name, docCount: t.docCount }));
}

// 重新计算标签的文档数量
async function recalculateDocCount(tagId: number, ownerId: number): Promise<void> {
  const tag = await getTag(tagId, ownerId);
  if (!tag) return;

  const allDocs = await dbAll(
    db.select({ tags: docs.tags }).from(docs).where(eq(docs.ownerId, ownerId))
  );

  let count = 0;
  for (const doc of allDocs) {
    try {
      const docTags: string[] = JSON.parse(doc.tags || "[]");
      if (docTags.includes(tag.name)) count++;
    } catch {
      // 忽略
    }
  }

  await db.update(tags).set({ docCount: count }).where(and(eq(tags.id, tagId), eq(tags.ownerId, ownerId))).execute();
}

// 辅助函数：映射数据库记录到 Tag
function mapTag(record: Record<string, unknown>): Tag {
  return {
    id: record.id as number,
    name: record.name as string,
    color: record.color as string,
    parentId: record.parent_id as number | null,
    ownerId: record.owner_id as number,
    docCount: record.doc_count as number,
    createdAt: record.created_at as Date,
  };
}
