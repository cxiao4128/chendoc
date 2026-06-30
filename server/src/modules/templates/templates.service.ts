// ChenDoc v2.10.0 - 模板服务
// 提供模板的 CRUD 操作，支持云端同步

import { db, dbAll, dbGet } from "../../db/client.js";
import { templates } from "../../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import crypto from "node:crypto";

export interface Template {
  id: number;
  templateUid: string;
  title: string;
  summary?: string;
  html: string;
  contentJson?: string;
  sort: number;
  isBuiltIn: boolean;
  ownerId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateInput {
  title: string;
  summary?: string;
  html: string;
  contentJson?: string;
  sort?: number;
}

export interface UpdateTemplateInput {
  title?: string;
  summary?: string;
  html?: string;
  contentJson?: string;
  sort?: number;
}

const MAX_TEMPLATES_PER_USER = 50;

// 生成模板 UID
function generateTemplateUid(): string {
  return crypto.randomBytes(12).toString("hex");
}

// 获取用户所有模板
export async function listTemplates(ownerId: number): Promise<Template[]> {
  const result = await dbAll(
    db.select().from(templates)
      .where(eq(templates.ownerId, ownerId))
      .orderBy(desc(templates.sort), templates.title)
  );
  return result.map(mapTemplate);
}

// 获取内置模板
export async function listBuiltInTemplates(): Promise<Template[]> {
  const result = await dbAll(
    db.select().from(templates)
      .where(eq(templates.isBuiltIn, true))
      .orderBy(desc(templates.sort), templates.title)
  );
  return result.map(mapTemplate);
}

// 获取单个模板
export async function getTemplate(id: number, ownerId?: number): Promise<Template | null> {
  const query = ownerId
    ? db.select().from(templates).where(and(eq(templates.id, id), eq(templates.ownerId, ownerId)))
    : db.select().from(templates).where(eq(templates.id, id));
  const result = await dbGet(query.limit(1));
  return result ? mapTemplate(result) : null;
}

// 创建模板
export async function createTemplate(ownerId: number, input: CreateTemplateInput): Promise<Template> {
  // 检查模板数量限制
  const existingCount = await dbAll(
    db.select({ count: templates.id }).from(templates).where(eq(templates.ownerId, ownerId))
  );
  if (existingCount.length >= MAX_TEMPLATES_PER_USER) {
    throw new Error(`模板数量已达上限（${MAX_TEMPLATES_PER_USER}个）`);
  }

  const now = new Date();
  const result = await db.insert(templates).values({
    templateUid: generateTemplateUid(),
    title: input.title.trim(),
    summary: input.summary || null,
    html: input.html,
    contentJson: input.contentJson || null,
    sort: input.sort || 0,
    isBuiltIn: false,
    ownerId,
    createdAt: now,
    updatedAt: now,
  }).returning().execute();

  return mapTemplate(result[0]);
}

// 更新模板
export async function updateTemplate(
  id: number,
  ownerId: number,
  input: UpdateTemplateInput
): Promise<Template | null> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) values.title = input.title.trim();
  if (input.summary !== undefined) values.summary = input.summary || null;
  if (input.html !== undefined) values.html = input.html;
  if (input.contentJson !== undefined) values.contentJson = input.contentJson || null;
  if (input.sort !== undefined) values.sort = input.sort;

  const result = await db.update(templates)
    .set(values)
    .where(and(eq(templates.id, id), eq(templates.ownerId, ownerId)))
    .returning().execute();

  return result.length > 0 ? mapTemplate(result[0]) : null;
}

// 删除模板
export async function deleteTemplate(id: number, ownerId: number): Promise<boolean> {
  // 不能删除内置模板
  const template = await getTemplate(id, ownerId);
  if (template?.isBuiltIn) {
    throw new Error("无法删除内置模板");
  }

  const result = await db.delete(templates)
    .where(and(eq(templates.id, id), eq(templates.ownerId, ownerId)))
    .returning().execute();

  return result.length > 0;
}

// 获取模板数量
export async function getTemplateCount(ownerId: number): Promise<number> {
  const result = await dbAll(
    db.select({ count: templates.id }).from(templates).where(eq(templates.ownerId, ownerId))
  );
  return result.length;
}

// 映射数据库记录到模板对象
function mapTemplate(row: any): Template {
  return {
    id: row.id,
    templateUid: row.templateUid,
    title: row.title,
    summary: row.summary || undefined,
    html: row.html,
    contentJson: row.contentJson || undefined,
    sort: row.sort,
    isBuiltIn: row.isBuiltIn,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
