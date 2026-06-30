// ChenDoc v2.10.0 - 模板 API
// 封装模板相关的 Gateway 请求

import { request } from "./request.js";

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
  createdAt: string;
  updatedAt: string;
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

// 获取内置模板
export async function listBuiltInTemplates(): Promise<Template[]> {
  const res = await request<{ templates: Template[] }>("/api/templates/builtin");
  return res.templates || [];
}

// 获取用户所有模板
export async function listTemplates(): Promise<Template[]> {
  const res = await request<{ templates: Template[] }>("/api/templates");
  return res.templates || [];
}

// 获取单个模板
export async function getTemplate(id: number): Promise<Template | null> {
  const res = await request<{ template: Template | null }>(`/api/templates/${id}`);
  return res.template;
}

// 创建模板
export async function createTemplate(input: CreateTemplateInput): Promise<Template> {
  const res = await request<{ template: Template }>("/api/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.template;
}

// 更新模板
export async function updateTemplate(id: number, input: UpdateTemplateInput): Promise<Template> {
  const res = await request<{ template: Template }>(`/api/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.template;
}

// 删除模板
export async function deleteTemplate(id: number): Promise<void> {
  await request(`/api/templates/${id}`, { method: "DELETE" });
}

// 模板数量限制
export const MAX_TEMPLATES_PER_USER = 50;