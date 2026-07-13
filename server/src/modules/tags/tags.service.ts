// ChenDoc v2.10.0 - 标签服务增强版
// 提供标签的 CRUD、层级、批量操作、合并功能

import { docs, tagHierarchy, tags } from "./tags.repo.js";
export { docs, tagHierarchy, tags };

import {
  listTags as listTagsRaw,
  getTag as getTagRaw,
  insertTag,
  updateTagByIdOwner,
  deleteTag as deleteTagRaw,
  getChildrenOfTag,
  promoteChildrenToRoot,
  deleteTagHierarchy,
  getTagsByIds,
  getDocsWithTags,
  updateDocTags,
  updateTagDocCount,
} from "./tags.repo.js";

// 预设颜色
export const TAG_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#6366f1", "#84cc16", "#f97316",
] as const;

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
export async function listTagsService(ownerId: number): Promise<Tag[]> {
  const result = await listTagsRaw(ownerId);
  return (result as unknown as Record<string, unknown>[]).map(mapTag);
}

// 获取用户标签树形结构
export async function getTagTree(ownerId: number): Promise<TagWithChildren[]> {
  const allTags = await listTagsService(ownerId);
  const tagMap = new Map<number, TagWithChildren>();

  for (const tag of allTags) {
    tagMap.set(tag.id, { ...tag, children: [] });
  }

  const rootTags: TagWithChildren[] = [];

  for (const tag of allTags) {
    const tagWithChildren = tagMap.get(tag.id)!;
    if (tag.parentId === null) {
      rootTags.push(tagWithChildren);
    } else {
      const parent = tagMap.get(tag.parentId);
      if (parent) {
        parent.children.push(tagWithChildren);
      } else {
        rootTags.push(tagWithChildren);
      }
    }
  }

  return rootTags;
}

// 获取单个标签
export async function getTagById(id: number, ownerId: number): Promise<Tag | null> {
  const result = await getTagRaw(id, ownerId);
  return result ? mapTag(result) : null;
}

// 创建标签
export async function createTag(ownerId: number, input: CreateTagInput): Promise<Tag> {
  const name = input.name.trim();
  const color = input.color && isValidColor(input.color)
    ? input.color
    : TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];

  let parentId: number | null = null;
  if (input.parentId) {
    const parent = await getTagById(input.parentId, ownerId);
    if (parent) parentId = input.parentId;
  }

  const result = await insertTag({ name, color, parentId, ownerId, docCount: 0, createdAt: new Date() });
  return mapTag(result);
}

// 更新标签
export async function updateTag(id: number, ownerId: number, input: UpdateTagInput): Promise<Tag | null> {
  const existing = await getTagById(id, ownerId);
  if (!existing) return null;

  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.color !== undefined && isValidColor(input.color)) values.color = input.color;
  if (input.parentId !== undefined) {
    if (input.parentId === id) return null;
    if (input.parentId !== null) {
      const isDescendant = await isDescendantOf(input.parentId, id, ownerId);
      if (isDescendant) return null;
      values.parentId = input.parentId;
    } else {
      values.parentId = null;
    }
  }

  if (Object.keys(values).length === 0) return existing;

  const result = await updateTagByIdOwner(id, ownerId, values);
  return result ? mapTag(result) : null;
}

// 删除标签
export async function deleteTag(id: number, ownerId: number): Promise<boolean> {
  const tag = await getTagById(id, ownerId);
  if (!tag) return false;

  const taggedDocs = await getDocsWithTags(ownerId);
  for (const doc of taggedDocs) {
    try {
      const docTags: string[] = JSON.parse((doc.tags as unknown as string) || "[]");
      if (docTags.includes(tag.name)) {
        const updatedTags = docTags.filter((t) => t !== tag.name);
        await updateDocTags(doc.id, JSON.stringify(updatedTags));
      }
    } catch {
      // 忽略解析错误
    }
  }

  await promoteChildrenToRoot(id, ownerId);
  await deleteTagHierarchy(id);
  return await deleteTagRaw(id, ownerId);
}

// 检查目标标签是否是源标签的后代
async function isDescendantOf(targetId: number, sourceId: number, ownerId: number): Promise<boolean> {
  const children = await getChildrenOfTag(sourceId, ownerId);
  for (const child of children) {
    if (child.id === targetId) return true;
    if (await isDescendantOf(targetId, child.id, ownerId)) return true;
  }
  return false;
}

// 批量添加标签到文档
export async function addTagsToDocs(ownerId: number, tagIds: number[], docIds: number[]): Promise<{ updated: number }> {
  if (tagIds.length === 0 || docIds.length === 0) return { updated: 0 };

  const tagRecords = await getTagsByIds(tagIds, ownerId);
  const tagNames = tagRecords.map((t) => t.name);

  let updated = 0;
  for (const docId of docIds) {
    const docs = await getDocsWithTags(ownerId);
    const doc = docs.find(d => d.id === docId);
    if (!doc) continue;

    try {
      const docTags: string[] = JSON.parse((doc.tags as unknown as string) || "[]");
      let changed = false;
      for (const tagName of tagNames) {
        if (!docTags.includes(tagName)) {
          docTags.push(tagName);
          changed = true;
        }
      }
      if (changed) {
        await updateDocTags(docId, JSON.stringify(docTags));
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

  const tagRecords = await getTagsByIds(tagIds, ownerId);
  const tagNames = tagRecords.map((t) => t.name);

  let updated = 0;
  for (const docId of docIds) {
    const docs = await getDocsWithTags(ownerId);
    const doc = docs.find(d => d.id === docId);
    if (!doc) continue;

    try {
      const docTags: string[] = JSON.parse((doc.tags as unknown as string) || "[]");
      const originalLength = docTags.length;
      const filteredTags = docTags.filter((t) => !tagNames.includes(t));
      if (filteredTags.length !== originalLength) {
        await updateDocTags(docId, JSON.stringify(filteredTags));
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

  const sourceTag = await getTagById(sourceTagId, ownerId);
  const targetTag = await getTagById(targetTagId, ownerId);
  if (!sourceTag || !targetTag) return null;

  const taggedDocs = await getDocsWithTags(ownerId);
  let mergedCount = 0;
  for (const doc of taggedDocs) {
    try {
      const docTags: string[] = JSON.parse((doc.tags as unknown as string) || "[]");
      const sourceIndex = docTags.indexOf(sourceTag.name);
      if (sourceIndex !== -1) {
        if (!docTags.includes(targetTag.name)) {
          docTags[sourceIndex] = targetTag.name;
        } else {
          docTags.splice(sourceIndex, 1);
        }
        await updateDocTags(doc.id, JSON.stringify(docTags));
        mergedCount++;
      }
    } catch {
      // 忽略解析错误
    }
  }

  await deleteTagRaw(sourceTagId, ownerId);
  await recalculateDocCount(targetTagId, ownerId);
  return { mergedCount };
}

// 重命名标签
export async function renameTag(ownerId: number, tagId: number, newName: string): Promise<Tag | null> {
  const tag = await getTagById(tagId, ownerId);
  if (!tag) return null;

  const oldName = tag.name;
  if (oldName === newName.trim()) return tag;

  const taggedDocs = await getDocsWithTags(ownerId);
  for (const doc of taggedDocs) {
    try {
      const docTags: string[] = JSON.parse((doc.tags as unknown as string) || "[]");
      const index = docTags.indexOf(oldName);
      if (index !== -1) {
        docTags[index] = newName.trim();
        await updateDocTags(doc.id, JSON.stringify(docTags));
      }
    } catch {
      // 忽略解析错误
    }
  }

  return await updateTag(tagId, ownerId, { name: newName.trim() });
}

// 获取标签使用统计
export async function getTagStats(ownerId: number): Promise<{ tagId: number; tagName: string; docCount: number }[]> {
  const allTags = await listTagsService(ownerId);
  return allTags.map((t) => ({ tagId: t.id, tagName: t.name, docCount: t.docCount }));
}

// 重新计算标签的文档数量
async function recalculateDocCount(tagId: number, ownerId: number): Promise<void> {
  const tag = await getTagById(tagId, ownerId);
  if (!tag) return;

  const allDocs = await getDocsWithTags(ownerId);
  let count = 0;
  for (const doc of allDocs) {
    try {
      const docTags: string[] = JSON.parse((doc.tags as unknown as string) || "[]");
      if (docTags.includes(tag.name)) count++;
    } catch {
      // 忽略
    }
  }

  await updateTagDocCount(tagId, ownerId, count);
}

// 辅助函数：映射数据库记录到 Tag
function mapTag(record: Record<string, unknown>): Tag {
  return {
    id: record.id as number,
    name: record.name as string,
    color: record.color as string,
    parentId: record.parentId as number | null,
    ownerId: record.ownerId as number,
    docCount: record.docCount as number,
    createdAt: record.createdAt as Date,
  };
}

// 路由别名（兼容原有路由调用）
export const listTags = listTagsService;
export { getTagById as getTag };
