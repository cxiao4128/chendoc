import { request } from "./request";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "multiselect"
  | "date"
  | "datetime"
  | "time"
  | "phone"
  | "email"
  | "rating"
  | "file"
  | "image"
  | "city"
  | "location"
  | "signature"
  | "name"
  | "age"
  | "address"
  | "idcard"
  | "gender"
  | "matrix"
  | "matrix_text"
  | "scale"
  | "table"
  | "section"
  | "sort"
  | "qrcode"
  | "cascader";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  order: number;
}

export interface FormConfig {
  maxSubmissions?: number | null;
  allowMultiple: boolean;
  privacyNotice?: string | null;
  retentionDays?: number | null;
  storeUserAgent?: boolean;
}

export interface FormItem {
  id: number;
  formUid: string;
  title: string;
  description: string | null;
  fields: FormField[];
  ownerId: number;
  status: "draft" | "published" | "closed";
  maxSubmissions: number | null;
  allowMultiple: boolean;
  privacyNotice: string | null;
  retentionDays: number | null;
  storeUserAgent: boolean;
  exclusiveInfo: Record<string, string> | null;  // 提交后展示的专属信息
  viewCount: number;
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionItem {
  id: number;
  formId: number;
  data: Record<string, unknown>;
  ip: string;
  submitterId?: string | null;
  userAgent: string | null;
  submittedAt: string;
}

export interface IpStats {
  ip: string;
  count: number;
  firstAt: string;
  lastAt: string;
}

// 创建表单
export function createFormApi(body: {
  title: string;
  description?: string;
  fields: FormField[];
  config?: FormConfig;
  exclusiveInfo?: Record<string, string> | null;
}) {
  return request<{ form: FormItem }>("/api/forms", { method: "POST", body: JSON.stringify(body) });
}

// 表单列表
export function listFormsApi() {
  return request<{ forms: FormItem[] }>("/api/forms");
}

// 获取表单详情
export function getFormApi(id: number) {
  return request<{ form: FormItem }>(`/api/forms/${id}`);
}

// 更新表单
export function updateFormApi(id: number, body: {
  title?: string;
  description?: string;
  fields?: FormField[];
  config?: FormConfig;
  exclusiveInfo?: Record<string, string> | null;
}) {
  return request<{ form: FormItem }>(`/api/forms/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

// 删除表单
export function deleteFormApi(id: number) {
  return request<{ formUid: string }>(`/api/forms/${id}`, { method: "DELETE" });
}

// 发布/关闭表单
export function publishFormApi(id: number, action: "publish" | "close" = "publish") {
  return request<{ form: FormItem }>(`/api/forms/${id}/publish`, {
    method: "POST",
    body: JSON.stringify({ action })
  });
}

// 提交列表
export function listSubmissionsApi(id: number, options?: { page?: number; pageSize?: number }) {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));
  const query = params.toString();
  return request<{
    form: FormItem;
    submissions: SubmissionItem[];
    pagination: { page: number; pageSize: number; hasMore: boolean };
  }>(`/api/forms/${id}/submissions${query ? `?${query}` : ""}`);
}

// 导出数据
export function exportFormApi(id: number, format: "csv" | "json" | "xlsx" = "csv") {
  return request<{
    form: FormItem;
    submissions: SubmissionItem[];
    format: string;
  }>(`/api/forms/${id}/export?format=${format}`);
}

// IP统计
export function getIpStatsApi(id: number) {
  return request<{ stats: IpStats[] }>(`/api/forms/${id}/ip-stats`);
}

// 删除单条提交记录
export function deleteSubmissionApi(formId: number, submissionId: number) {
  return request<{ ok: boolean }>(`/api/forms/${formId}/submissions/${submissionId}`, { method: "DELETE" });
}

export function deleteAllSubmissionsApi(formId: number) {
  return request<{ deleted: number }>(`/api/forms/${formId}/submissions`, { method: "DELETE" });
}
