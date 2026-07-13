import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { dbTransaction } from "../../db/client.js";
import { docs, formSubmissions, forms, users } from "./forms.repo.js";
export { docs, formSubmissions, forms, users };

import {
  getFormById,
  getFormByUid as getFormByUidRaw,
  listFormsByOwner,
  listAllForms,
  insertForm,
  updateFormById,
  deleteFormById,
  updateFormSubmissionCount,
  resetFormSubmissionCount,
  deleteFormSubmissionsByFormId,
  deleteFormSubmissionById,
  getSubmissionById,
  listSubmissionsByFormId,
  listAllSubmissionsByFormId,
  countSubmissionsByIp,
  countSubmissionsBySubmitterId,
  countRecentSubmissionsByIp,
  insertSubmission,
  cleanupExpiredSubmissions,
  recalculateAllFormCounts,
  updateFormCountIfMismatch,
  getFormIpStats as getFormIpStatsRaw,
  incrementFormViewCount,
  incrementFormSubmissionCountCond,
} from "./forms.repo.js";
import { env } from "../../config/env.js";
import { now } from "../../utils/date.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { verifyCaptcha } from "../captcha/captcha.service.js";
import { FormSubmissionPolicy } from "./FormSubmissionPolicy.js";

const IP_SUBMIT_LIMIT = 10;

function anonymousIdentity(value: string, formUid: string, kind: "browser" | "network") {
  return createHmac("sha256", env.configEncryptionKey).update(`${kind}\0${formUid}\0${value || "unknown"}`).digest("hex");
}

// ===== 类型定义 =====
export type FieldType =
  | "text" | "textarea" | "number" | "select" | "radio" | "checkbox" | "multiselect"
  | "date" | "datetime" | "time" | "phone" | "email" | "rating"
  | "file" | "image" | "city" | "location" | "signature"
  | "name" | "age" | "address" | "idcard" | "gender"
  | "matrix" | "matrix_text" | "scale" | "table"
  | "section" | "sort" | "qrcode" | "cascader";

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

export interface FormRecord {
  id: number;
  formUid: string;
  title: string;
  description: string | null;
  fields: FormField[];
  ownerId: number;
  status: "draft" | "published" | "closed";
  maxSubmissions: number | null;
  allowMultiple: boolean;
  exclusiveInfo: Record<string, string> | null;
  privacyNotice: string | null;
  retentionDays: number | null;
  storeUserAgent: boolean;
  viewCount: number;
  submissionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionRecord {
  id: number;
  formId: number;
  data: Record<string, unknown>;
  ip: string;
  submitterId: string | null;
  userAgent: string | null;
  submittedAt: Date;
}

type Actor = { id: number; role: "admin" | "user"; isSuperAdmin?: boolean };

// ===== Schema 验证 =====
const optionFieldTypes = new Set<FieldType>(["select", "radio", "multiselect"]);

const fieldSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "字段 ID 格式无效"),
  type: z.enum([
    "text", "textarea", "number", "select", "radio", "checkbox", "multiselect",
    "date", "datetime", "time", "phone", "email", "rating",
    "file", "image", "city", "location", "signature",
    "name", "age", "address", "idcard", "gender",
    "matrix", "matrix_text", "scale", "table",
    "section", "sort", "qrcode", "cascader"
  ]),
  label: z.string().trim().min(1).max(64),
  required: z.boolean(),
  placeholder: z.string().max(128).optional(),
  options: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  maxLength: z.number().int().min(1).max(2000).optional(),
  order: z.number().int().min(0)
}).superRefine((field, ctx) => {
  if (optionFieldTypes.has(field.type) && (!field.options || field.options.length === 0)) {
    ctx.addIssue({ code: "custom", path: ["options"], message: `字段 "${field.label}" 至少需要一个选项` });
  }
  if (field.options && new Set(field.options).size !== field.options.length) {
    ctx.addIssue({ code: "custom", path: ["options"], message: `字段 "${field.label}" 的选项不能重复` });
  }
  if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
    ctx.addIssue({ code: "custom", path: ["max"], message: `字段 "${field.label}" 的最大值不能小于最小值` });
  }
});

const fieldsSchema = z.array(fieldSchema).max(50).superRefine((fields, ctx) => {
  const seen = new Set<string>();
  fields.forEach((field, index) => {
    if (seen.has(field.id)) {
      ctx.addIssue({ code: "custom", path: [index, "id"], message: "字段 ID 不能重复" });
    }
    seen.add(field.id);
  });
});

const exclusiveInfoSchema = z.record(
  z.string().trim().min(1).max(64),
  z.string().trim().max(1000)
).nullable();

const createFormSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000).optional().nullable(),
  fields: fieldsSchema,
  config: z.object({
    maxSubmissions: z.number().int().positive().nullable().optional(),
    allowMultiple: z.boolean().optional(),
    privacyNotice: z.string().trim().max(500).nullable().optional(),
    retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
    storeUserAgent: z.boolean().optional()
  }).optional(),
  exclusiveInfo: exclusiveInfoSchema.optional()
});

const updateFormSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(1000).optional().nullable(),
  fields: fieldsSchema.optional(),
  config: z.object({
    maxSubmissions: z.number().int().positive().nullable().optional(),
    allowMultiple: z.boolean().optional(),
    privacyNotice: z.string().trim().max(500).nullable().optional(),
    retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
    storeUserAgent: z.boolean().optional()
  }).optional(),
  exclusiveInfo: exclusiveInfoSchema.optional()
});

// ===== 工具函数 =====
function generateFormUid() {
  return randomBytes(12).toString("base64url");
}

function safeFormRecord(form: typeof forms.$inferSelect): FormRecord {
  return {
    id: form.id,
    formUid: form.formUid,
    title: form.title,
    description: form.description,
    fields: JSON.parse(form.fields) as FormField[],
    ownerId: form.ownerId,
    status: form.status as "draft" | "published" | "closed",
    maxSubmissions: form.maxSubmissions === null ? null : Number(form.maxSubmissions),
    allowMultiple: Boolean(form.allowMultiple),
    exclusiveInfo: form.exclusiveInfo ? JSON.parse(form.exclusiveInfo) : null,
    privacyNotice: form.privacyNotice ?? null,
    retentionDays: form.retentionDays ? Number(form.retentionDays) : null,
    storeUserAgent: Boolean(form.storeUserAgent),
    viewCount: form.viewCount,
    submissionCount: form.submissionCount,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt
  };
}

function assertCanManageForm(actor: Actor, form: FormRecord) {
  if (actor.isSuperAdmin) return;
  if (form.ownerId !== actor.id) throw new ForbiddenError("无权管理此表单", "FORM_FORBIDDEN");
}

// ===== 字段验证 =====
function validateFieldValue(field: FormField, value: unknown): string | null {
  const strValue = typeof value === "string" ? value.trim() : "";

  if (field.required && field.type === "checkbox" && value !== true && value !== "true") {
    return `请勾选"${field.label}"`;
  }

  if (field.required && field.type !== "checkbox" && !strValue && value !== false) {
    return `请填写"${field.label}"`;
  }

  if (!strValue && value !== false) return null;

  switch (field.type) {
    case "text":
    case "textarea":
    case "name":
    case "address":
    case "idcard":
      if (field.maxLength && strValue.length > field.maxLength) {
        return `"${field.label}"不能超过${field.maxLength}个字符`;
      }
      if (field.type === "idcard" && strValue && !/^(?:\d{15}|\d{17}[\dXx])$/.test(strValue)) {
        return `"${field.label}"格式不正确`;
      }
      break;

    case "number":
    case "age":
      if (strValue) {
        const num = Number(value);
        if (isNaN(num)) return `"${field.label}"必须是数字`;
        if (field.min !== undefined && num < field.min) {
          return `"${field.label}"不能小于${field.min}`;
        }
        if (field.max !== undefined && num > field.max) {
          return `"${field.label}"不能大于${field.max}`;
        }
      }
      break;

    case "phone":
      if (strValue && !/^1[3-9]\d{9}$/.test(strValue)) {
        return `"${field.label}"格式不正确`;
      }
      break;

    case "email":
      if (strValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
        return `"${field.label}"格式不正确`;
      }
      break;

    case "select":
    case "radio":
      if (strValue && field.options && !field.options.includes(strValue)) {
        return `"${field.label}"选项无效`;
      }
      break;

    case "gender":
      if (strValue && !["男", "女", "其他"].includes(strValue)) {
        return `"${field.label}"选项无效`;
      }
      break;

    case "rating": {
      const rating = Number(value);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return `"${field.label}"必须是 1 到 5 星`;
      }
      break;
    }

    case "image":
      try {
        if (strValue) new URL(strValue);
      } catch {
        return `"${field.label}"必须是有效链接`;
      }
      break;

    case "multiselect":
      if (!Array.isArray(value)) return `"${field.label}"必须是多选值`;
      for (const v of value) {
        if (field.options && !field.options.includes(String(v))) {
          return `"${field.label}"包含无效选项`;
        }
      }
      break;

    case "checkbox":
      if (value !== true && value !== false && value !== "true" && value !== "false") {
        return `"${field.label}"必须是勾选值`;
      }
      break;
  }

  return null;
}

export function validateFormSubmission(fields: FormField[], data: Record<string, unknown>): string | null {
  for (const field of fields) {
    const value = data[field.id];
    const error = validateFieldValue(field, value);
    if (error) return error;
  }
  return null;
}

// ===== 服务函数 =====
export async function createForm(actor: Actor, input: unknown) {
  const body = createFormSchema.parse(input);
  const formUid = generateFormUid();
  const createdAt = now();

  const { lastInsertRowid } = await insertForm({
    formUid,
    title: body.title,
    description: body.description ?? null,
    fields: JSON.stringify(body.fields),
    ownerId: actor.id,
    status: "draft",
    maxSubmissions: body.config?.maxSubmissions ?? null,
    allowMultiple: body.config?.allowMultiple ?? true,
    exclusiveInfo: body.exclusiveInfo ? JSON.stringify(body.exclusiveInfo) : null,
    privacyNotice: body.config?.privacyNotice ?? null,
    retentionDays: body.config?.retentionDays ?? null,
    storeUserAgent: body.config?.storeUserAgent ?? false,
    createdAt,
    updatedAt: createdAt
  });

  return await getForm(Number(lastInsertRowid), actor);
}

export async function listForms(actor: Actor) {
  const rows = actor.isSuperAdmin
    ? await listAllForms()
    : await listFormsByOwner(actor.id);

  return rows.map(safeFormRecord);
}

export async function getForm(id: number, actor?: Actor) {
  const form = await getFormById(id);
  if (!form) throw new NotFoundError("表单不存在", "FORM_NOT_FOUND");

  if (actor) assertCanManageForm(actor, safeFormRecord(form));
  return safeFormRecord(form);
}

export async function getFormByUid(formUid: string) {
  const form = await getFormByUidRaw(formUid);
  if (!form) throw new NotFoundError("表单不存在", "FORM_NOT_FOUND");
  return safeFormRecord(form);
}

export async function updateForm(id: number, actor: Actor, input: unknown) {
  const body = updateFormSchema.parse(input);
  await getForm(id, actor);

  const patch: Record<string, unknown> = { updatedAt: now() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description ?? null;
  if (body.fields !== undefined) patch.fields = JSON.stringify(body.fields);
  if (body.config?.allowMultiple !== undefined) patch.allowMultiple = body.config.allowMultiple;
  if (body.config?.maxSubmissions !== undefined) patch.maxSubmissions = body.config.maxSubmissions;
  if (body.config?.privacyNotice !== undefined) patch.privacyNotice = body.config.privacyNotice;
  if (body.config?.retentionDays !== undefined) patch.retentionDays = body.config.retentionDays;
  if (body.config?.storeUserAgent !== undefined) patch.storeUserAgent = body.config.storeUserAgent;
  if (body.exclusiveInfo !== undefined) {
    patch.exclusiveInfo = body.exclusiveInfo ? JSON.stringify(body.exclusiveInfo) : null;
  }

  await updateFormById(id, patch);
  return await getForm(id, actor);
}

export async function deleteForm(id: number, actor: Actor) {
  const form = await getForm(id, actor);
  await dbTransaction(async (tx) => {
    await deleteFormSubmissionsByFormId(form.id, tx);
    await deleteFormById(form.id, tx);
  });
  return { formUid: form.formUid };
}

export async function deleteSubmission(formId: number, submissionId: number, actor: Actor) {
  await getForm(formId, actor);

  await dbTransaction(async (tx) => {
    const submission = await getSubmissionById(submissionId, tx);
    if (!submission) throw new NotFoundError("提交记录不存在", "SUBMISSION_NOT_FOUND");
    if (submission.formId !== formId) throw new ForbiddenError("提交记录不属于此表单", "SUBMISSION_FORBIDDEN");

    await deleteFormSubmissionById(submissionId, tx);
    await updateFormSubmissionCount(formId, -1, tx);
  });

  return { ok: true };
}

export async function deleteAllFormSubmissions(formId: number, actor: Actor) {
  await getForm(formId, actor);
  return await dbTransaction(async (tx) => {
    await resetFormSubmissionCount(formId, tx);
    const result = await deleteFormSubmissionsByFormId(formId, tx);
    if (result.changes > 0) {
      await updateFormSubmissionCount(formId, -result.changes, tx);
    }
    return { deleted: result.changes };
  });
}

export async function publishForm(id: number, actor: Actor) {
  const form = await getForm(id, actor);
  if (!form.fields.some((field) => field.type !== "section")) {
    throw new BadRequestError("请先添加至少一个字段", "FORM_NO_FIELDS");
  }

  await updateFormById(id, { status: "published", updatedAt: now() });
  return await getForm(id, actor);
}

export async function closeForm(id: number, actor: Actor) {
  await getForm(id, actor);
  await updateFormById(id, { status: "closed", updatedAt: now() });
  return await getForm(id, actor);
}

export async function incrementFormView(formUid: string) {
  await incrementFormViewCount(formUid);
}

export async function submitForm(
  formUid: string,
  data: Record<string, unknown>,
  meta: { ip: string; userAgent?: string; submitterId?: string },
  captcha?: { captchaId?: string; captchaCode?: string }
) {
  let form = await getFormByUid(formUid);
  if (form.retentionDays) {
    await cleanupExpired(form);
    form = await getFormByUid(formUid);
  }
  if (Object.keys(data).length > 50 || Buffer.byteLength(JSON.stringify(data), "utf8") > 64 * 1024) {
    throw new BadRequestError("提交数据超过容量限制", "FORM_PAYLOAD_TOO_LARGE");
  }
  for (const value of Object.values(data)) {
    const values = Array.isArray(value) ? value : [value];
    if (values.length > 20 || values.some((item) => typeof item === "string" && item.length > 4096)) {
      throw new BadRequestError("单个字段内容超过限制", "FORM_VALUE_TOO_LARGE");
    }
  }

  const browserIdentity = anonymousIdentity(meta.submitterId || meta.ip, formUid, "browser");
  const networkIdentity = anonymousIdentity(meta.ip, formUid, "network");
  const submitterId = form.allowMultiple ? null : browserIdentity;
  const recentIpCount = await countRecentSubmissionsByIp(
    form.id,
    `来源-${networkIdentity.slice(0, 12)}`,
    new Date(Date.now() - 60_000)
  );
  if (recentIpCount >= IP_SUBMIT_LIMIT) {
    throw new BadRequestError("提交过于频繁，请稍后再试", "FORM_RATE_LIMITED");
  }
  const previousIpCount = await countSubmissionsByIp(form.id, `来源-${networkIdentity.slice(0, 12)}`);
  const previousSubmitterCount = submitterId
    ? await countSubmissionsBySubmitterId(form.id, submitterId)
    : 0;
  const policy = new FormSubmissionPolicy(form, previousIpCount, previousSubmitterCount);
  policy.assertAvailable();
  policy.assertRepeatAllowed();
  policy.assertFieldWhitelist(data);
  policy.assertRequiredFields(data);

  if (policy.requiresCaptcha()) {
    if (!captcha?.captchaId || !captcha?.captchaCode) {
      throw new BadRequestError("请先完成验证码", "FORM_NEED_CAPTCHA");
    }
    const captchaOk = await verifyCaptcha(captcha.captchaId, captcha.captchaCode);
    if (!captchaOk) {
      throw new BadRequestError("验证码错误", "FORM_CAPTCHA_FAILED");
    }
  }

  const validationError = validateFormSubmission(form.fields, data);
  if (validationError) {
    throw new BadRequestError(validationError, "VALIDATION_ERROR");
  }

  const submittedAt = now();
  try {
    await dbTransaction(async (tx) => {
      const currentRow = await getFormById(form.id, tx);
      if (!currentRow) throw new NotFoundError("表单不存在", "FORM_NOT_FOUND");
      const current = safeFormRecord(currentRow);
      const duplicateCount = submitterId
        ? await countSubmissionsBySubmitterId(form.id, submitterId, tx)
        : 0;
      const transactionalPolicy = new FormSubmissionPolicy(
        current,
        previousIpCount,
        duplicateCount
      );
      transactionalPolicy.assertAvailable();
      transactionalPolicy.assertRepeatAllowed();

      const counterUpdate = await incrementFormSubmissionCountCond(form.id, current.maxSubmissions, tx);
      if (counterUpdate.changes !== 1) throw new BadRequestError("提交人数已满", "FORM_FULL");

      await insertSubmission({
        formId: form.id,
        data: JSON.stringify(data),
        ip: `来源-${networkIdentity.slice(0, 12)}`,
        submitterId,
        userAgent: form.storeUserAgent ? (meta.userAgent ?? "").slice(0, 512) || null : null,
        submittedAt
      }, tx);
    });
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    if (submitterId && /unique|duplicate/i.test(error instanceof Error ? error.message : "")) {
      throw new BadRequestError("该表单不允许重复提交", "FORM_DUPLICATE_SUBMISSION");
    }
    throw error;
  }

  return { ok: true, submittedAt, exclusiveInfo: form.exclusiveInfo };
}

export async function recalibrateFormSubmissionCounts() {
  const rows = await recalculateAllFormCounts();
  let changed = 0;
  await dbTransaction(async (tx) => {
    for (const row of rows) {
      const result = await updateFormCountIfMismatch(row.id, row.count, tx);
      changed += result.changes;
    }
  });
  return changed;
}

export async function runFormMaintenance() {
  const allForms = await listAllForms();
  let expiredSubmissions = 0;
  for (const row of allForms) {
    const form = safeFormRecord(row);
    expiredSubmissions += await cleanupExpired(form);
  }
  return { expiredSubmissions, recalibratedForms: await recalibrateFormSubmissionCounts() };
}

export async function listFormSubmissions(formId: number, actor: Actor, options?: { page?: number; pageSize?: number }) {
  let form = await getForm(formId, actor);
  if (form.retentionDays) {
    await cleanupExpired(form);
    form = await getForm(formId, actor);
  }
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const rows = await listSubmissionsByFormId(formId, pageSize, offset);
  const hasMore = rows.length > pageSize;
  const submissions = rows.slice(0, pageSize).map((row): SubmissionRecord => ({
    id: row.id,
    formId: row.formId,
    data: JSON.parse(row.data),
    ip: row.ip,
    submitterId: row.submitterId,
    userAgent: row.userAgent,
    submittedAt: row.submittedAt
  }));

  return {
    form,
    submissions,
    pagination: { page, pageSize, hasMore }
  };
}

export async function exportFormSubmissions(formId: number, actor: Actor, format: "csv" | "json" | "xlsx" = "csv") {
  let form = await getForm(formId, actor);
  if (form.retentionDays) {
    await cleanupExpired(form);
    form = await getForm(formId, actor);
  }

  const rows = await listAllSubmissionsByFormId(formId);
  const submissions = rows.map((row): SubmissionRecord => ({
    id: row.id,
    formId: row.formId,
    data: JSON.parse(row.data),
    ip: row.ip,
    submitterId: row.submitterId,
    userAgent: row.userAgent,
    submittedAt: row.submittedAt
  }));

  return { form, submissions, format };
}

export interface IpStats {
  ip: string;
  count: number;
  firstAt: Date;
  lastAt: Date;
}

export async function getFormIpStats(formId: number, actor: Actor) {
  await getForm(formId, actor);
  const rows = await getFormIpStatsRaw(formId);
  return rows.map(row => ({
    ip: row.ip,
    count: row.count,
    firstAt: row.firstAt,
    lastAt: row.lastAt
  })) as IpStats[];
}

async function cleanupExpired(form: FormRecord) {
  if (!form.retentionDays) return 0;
  const cutoff = new Date(Date.now() - form.retentionDays * 24 * 60 * 60 * 1000);
  return await dbTransaction(async (tx) => {
    const removed = await cleanupExpiredSubmissions(form.id, cutoff, tx);
    if (removed.changes > 0) {
      await updateFormSubmissionCount(form.id, -removed.changes, tx);
    }
    return removed.changes;
  });
}
