/**
 * services/api/template.api.ts
 *
 * 模板 API 层 — 直接调用 HTTP 层
 */

import { request } from "@/api/request";

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

export async function listBuiltInTemplates(): Promise<Template[]> {
  const res = await request<{ templates: Template[] }>("/api/templates/builtin");
  return res.templates || [];
}

export async function listTemplates(): Promise<Template[]> {
  const res = await request<{ templates: Template[] }>("/api/templates");
  return res.templates || [];
}

export async function getTemplate(id: number): Promise<Template | null> {
  const res = await request<{ template: Template | null }>(`/api/templates/${id}`);
  return res.template;
}

export async function createTemplate(input: CreateTemplateInput): Promise<Template> {
  const res = await request<{ template: Template }>("/api/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.template;
}

export async function updateTemplate(id: number, input: UpdateTemplateInput): Promise<Template> {
  const res = await request<{ template: Template }>(`/api/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.template;
}

export async function deleteTemplate(id: number): Promise<void> {
  await request(`/api/templates/${id}`, { method: "DELETE" });
}

export const MAX_TEMPLATES_PER_USER = 50;
