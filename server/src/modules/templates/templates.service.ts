// ChenDoc v2.10.0 - 模板服务
// 提供模板的 CRUD 操作，支持云端同步

import crypto from "node:crypto";
import { listTemplates as listTemplatesFromRepo, listBuiltInTemplates as listBuiltInTemplatesFromRepo, getTemplateById, insertTemplate, updateTemplateById, deleteTemplateById, getTemplateCountByOwner } from "./templates.repo.js";
import type { Template, CreateTemplateInput, UpdateTemplateInput } from "./types.js";

const MAX_TEMPLATES_PER_USER = 50;

function generateTemplateUid(): string {
  return crypto.randomBytes(12).toString("hex");
}

export async function listTemplates(ownerId: number): Promise<Template[]> {
  const result = await listTemplatesFromRepo(ownerId);
  return result.map(mapTemplate);
}

export async function listBuiltInTemplates(): Promise<Template[]> {
  const result = await listBuiltInTemplatesFromRepo();
  return result.map(mapTemplate);
}

export async function getTemplate(id: number, ownerId?: number): Promise<Template | null> {
  const result = await getTemplateById(id, ownerId);
  return result ? mapTemplate(result) : null;
}

export async function createTemplate(ownerId: number, input: CreateTemplateInput): Promise<Template> {
  const existingCount = await getTemplateCountByOwner(ownerId);
  if (existingCount.length >= MAX_TEMPLATES_PER_USER) {
    throw new Error(`模板数量已达上限（${MAX_TEMPLATES_PER_USER}个）`);
  }

  const now = new Date();
  const created = await insertTemplate({
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
  });

  return mapTemplate(created);
}

export async function updateTemplate(
  id: number,
  ownerId: number,
  input: UpdateTemplateInput
): Promise<Template | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.summary !== undefined) patch.summary = input.summary || null;
  if (input.html !== undefined) patch.html = input.html;
  if (input.contentJson !== undefined) patch.contentJson = input.contentJson || null;
  if (input.sort !== undefined) patch.sort = input.sort;

  const result = await updateTemplateById(id, ownerId, patch);
  return result ? mapTemplate(result) : null;
}

export async function deleteTemplate(id: number, ownerId: number): Promise<boolean> {
  const template = await getTemplate(id, ownerId);
  if (template?.isBuiltIn) {
    throw new Error("无法删除内置模板");
  }
  return deleteTemplateById(id, ownerId);
}

export async function getTemplateCount(ownerId: number): Promise<number> {
  const result = await getTemplateCountByOwner(ownerId);
  return result.length;
}

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
