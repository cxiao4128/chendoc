import { and, eq, gte, lt, sql } from "drizzle-orm";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { db, dbAll, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { docs, formSubmissions, forms, users } from "../../db/schema.js";
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
  exclusiveInfo: Record<string, string> | null;  // 提交后展示的专属信息
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

type Actor = { id: number; role: "admin" | "user" };

// ===== Schema 验证 =====
const fieldSchema = z.object({
  id: z.string().min(1),
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
});

const createFormSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000).optional().nullable(),
  fields: z.array(fieldSchema).max(50),
  config: z.object({
    maxSubmissions: z.number().int().positive().nullable().optional(),
    allowMultiple: z.boolean().optional(),
    privacyNotice: z.string().trim().max(500).nullable().optional(),
    retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
    storeUserAgent: z.boolean().optional()
  }).optional(),
  exclusiveInfo: z.record(z.string(), z.string()).nullable().optional()
});

const updateFormSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(1000).optional().nullable(),
  fields: z.array(fieldSchema).max(50).optional(),
  config: z.object({
    maxSubmissions: z.number().int().positive().nullable().optional(),
    allowMultiple: z.boolean().optional(),
    privacyNotice: z.string().trim().max(500).nullable().optional(),
    retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
    storeUserAgent: z.boolean().optional()
  }).optional(),
  exclusiveInfo: z.record(z.string(), z.string()).nullable().optional()
});

const submitFormSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  captchaId: z.string().optional(),
  captchaCode: z.string().optional()
});

const exportSchema = z.object({
  format: z.enum(["csv", "json", "xlsx"]).optional()
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
  if (actor.role === "admin") return;
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
      if (field.maxLength && strValue.length > field.maxLength) {
        return `"${field.label}"不能超过${field.maxLength}个字符`;
      }
      break;

    case "number":
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

  const result = await dbRun(db.insert(forms).values({
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
  }));

  return await getForm(Number(result.lastInsertRowid), actor);
}

export async function listForms(actor: Actor) {
  const where = actor.role === "admin"
    ? undefined
    : eq(forms.ownerId, actor.id);

  const rows = await dbAll(
    db.select().from(forms).where(where).orderBy(sql`${forms.updatedAt} desc`)
  );

  return rows.map(safeFormRecord);
}

export async function getForm(id: number, actor?: Actor) {
  const form = await dbGet<typeof forms.$inferSelect>(
    db.select().from(forms).where(eq(forms.id, id)).limit(1)
  );
  if (!form) throw new NotFoundError("表单不存在", "FORM_NOT_FOUND");

  if (actor) assertCanManageForm(actor, safeFormRecord(form));
  return safeFormRecord(form);
}

export async function getFormByUid(formUid: string) {
  const form = await dbGet<typeof forms.$inferSelect>(
    db.select().from(forms).where(eq(forms.formUid, formUid)).limit(1)
  );
  if (!form) throw new NotFoundError("表单不存在", "FORM_NOT_FOUND");
  return safeFormRecord(form);
}

export async function updateForm(id: number, actor: Actor, input: unknown) {
  const body = updateFormSchema.parse(input);
  const form = await getForm(id, actor);

  const patch: Partial<typeof forms.$inferInsert> = { updatedAt: now() };
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

  await dbRun(db.update(forms).set(patch).where(eq(forms.id, id)));
  return await getForm(id, actor);
}

export async function deleteForm(id: number, actor: Actor) {
  const form = await getForm(id, actor);
  await dbTransaction(async (tx) => {
    await dbRun(tx.delete(formSubmissions).where(eq(formSubmissions.formId, id)));
    await dbRun(tx.delete(forms).where(eq(forms.id, id)));
  });
  return { formUid: form.formUid };
}

export async function deleteSubmission(formId: number, submissionId: number, actor: Actor) {
  // 验证表单权限
  await getForm(formId, actor);

  await dbTransaction(async (tx) => {
    const submission = await dbGet<typeof formSubmissions.$inferSelect>(
      tx.select().from(formSubmissions).where(eq(formSubmissions.id, submissionId)).limit(1)
    );
    if (!submission) throw new NotFoundError("提交记录不存在", "SUBMISSION_NOT_FOUND");
    if (submission.formId !== formId) throw new ForbiddenError("提交记录不属于此表单", "SUBMISSION_FORBIDDEN");

    await dbRun(tx.delete(formSubmissions).where(eq(formSubmissions.id, submissionId)));
    await dbRun(tx.update(forms).set({
      submissionCount: sql`CASE WHEN ${forms.submissionCount} > 0 THEN ${forms.submissionCount} - 1 ELSE 0 END`
    }).where(eq(forms.id, formId)));
  });

  return { ok: true };
}

export async function deleteAllFormSubmissions(formId: number, actor: Actor) {
  await getForm(formId, actor);
  return await dbTransaction(async (tx) => {
    await dbRun(tx.update(forms).set({
      submissionCount: sql`${forms.submissionCount}`
    }).where(eq(forms.id, formId)));
    const result = await dbRun(tx.delete(formSubmissions).where(eq(formSubmissions.formId, formId)));
    if (result.changes > 0) {
      await dbRun(tx.update(forms).set({
        submissionCount: sql`CASE WHEN ${forms.submissionCount} >= ${result.changes} THEN ${forms.submissionCount} - ${result.changes} ELSE 0 END`
      }).where(eq(forms.id, formId)));
    }
    return { deleted: result.changes };
  });
}

export async function publishForm(id: number, actor: Actor) {
  const form = await getForm(id, actor);
  if (form.fields.length === 0) {
    throw new BadRequestError("请先添加至少一个字段", "FORM_NO_FIELDS");
  }

  await dbRun(db.update(forms).set({
    status: "published",
    updatedAt: now()
  }).where(eq(forms.id, id)));

  return await getForm(id, actor);
}

export async function closeForm(id: number, actor: Actor) {
  const form = await getForm(id, actor);
  await dbRun(db.update(forms).set({
    status: "closed",
    updatedAt: now()
  }).where(eq(forms.id, id)));
  return await getForm(id, actor);
}

export async function incrementFormView(formUid: string) {
  await dbRun(
    db.update(forms).set({ viewCount: sql`${forms.viewCount} + 1` }).where(eq(forms.formUid, formUid))
  ).catch(() => undefined);
}

export async function submitForm(
  formUid: string,
  data: Record<string, unknown>,
  meta: { ip: string; userAgent?: string; submitterId?: string },
  captcha?: { captchaId?: string; captchaCode?: string }
) {
  let form = await getFormByUid(formUid);
  if (form.retentionDays) {
    await cleanupExpiredFormSubmissions(form);
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
  const recentRows = await dbAll<{ count: number }>(db
    .select({ count: sql<number>`count(*)` })
    .from(formSubmissions)
    .where(and(
      eq(formSubmissions.formId, form.id),
      eq(formSubmissions.ip, `来源-${networkIdentity.slice(0, 12)}`),
      gte(formSubmissions.submittedAt, new Date(Date.now() - 60_000))
    )));
  if (Number(recentRows[0]?.count ?? 0) >= IP_SUBMIT_LIMIT) {
    throw new BadRequestError("提交过于频繁，请稍后再试", "FORM_RATE_LIMITED");
  }
  const previousRows = await dbAll<{ count: number }>(db
    .select({ count: sql<number>`count(*)` })
    .from(formSubmissions)
    .where(and(eq(formSubmissions.formId, form.id), eq(formSubmissions.ip, `来源-${networkIdentity.slice(0, 12)}`))));
  const previousIpCount = Number(previousRows[0]?.count ?? 0);
  const previousSubmitterCount = submitterId
    ? Number((await dbAll<{ count: number }>(db
      .select({ count: sql<number>`count(*)` })
      .from(formSubmissions)
      .where(and(eq(formSubmissions.formId, form.id), eq(formSubmissions.submitterId, submitterId)))))[0]?.count ?? 0)
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

  // 验证提交数据
  const validationError = validateFormSubmission(form.fields, data);
  if (validationError) {
    throw new BadRequestError(validationError, "VALIDATION_ERROR");
  }

  const submittedAt = now();
  try {
    await dbTransaction(async (tx) => {
    const currentRow = await dbGet<typeof forms.$inferSelect>(
      tx.select().from(forms).where(eq(forms.id, form.id)).limit(1)
    );
    if (!currentRow) throw new NotFoundError("表单不存在", "FORM_NOT_FOUND");
    const current = safeFormRecord(currentRow);
    const duplicateRows = submitterId ? await dbAll<{ count: number }>(tx
      .select({ count: sql<number>`count(*)` })
      .from(formSubmissions)
      .where(and(eq(formSubmissions.formId, form.id), eq(formSubmissions.submitterId, submitterId)))) : [];
    const transactionalPolicy = new FormSubmissionPolicy(
      current,
      previousIpCount,
      Number(duplicateRows[0]?.count ?? 0)
    );
    transactionalPolicy.assertAvailable();
    transactionalPolicy.assertRepeatAllowed();

    const counterUpdate = current.maxSubmissions === null
      ? await dbRun(tx.update(forms).set({ submissionCount: sql`${forms.submissionCount} + 1` }).where(and(
          eq(forms.id, form.id),
          eq(forms.status, "published")
        )))
      : await dbRun(tx.update(forms).set({ submissionCount: sql`${forms.submissionCount} + 1` }).where(and(
          eq(forms.id, form.id),
          eq(forms.status, "published"),
          lt(forms.submissionCount, current.maxSubmissions)
        )));
    if (counterUpdate.changes !== 1) throw new BadRequestError("提交人数已满", "FORM_FULL");

    await dbRun(tx.insert(formSubmissions).values({
      formId: form.id,
      data: JSON.stringify(data),
      ip: `来源-${networkIdentity.slice(0, 12)}`,
      submitterId,
      userAgent: form.storeUserAgent ? (meta.userAgent ?? "").slice(0, 512) || null : null,
      submittedAt
    }));
    });
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    if (submitterId && /unique|duplicate/i.test(error instanceof Error ? error.message : "")) {
      throw new BadRequestError("该表单不允许重复提交", "FORM_DUPLICATE_SUBMISSION");
    }
    throw error;
  }

  // 返回专属信息（如果有）
  return { ok: true, submittedAt, exclusiveInfo: form.exclusiveInfo };
}

export async function recalibrateFormSubmissionCounts() {
  const rows = await dbAll<{ id: number; count: number }>(db
    .select({ id: forms.id, count: sql<number>`count(${formSubmissions.id})` })
    .from(forms)
    .leftJoin(formSubmissions, eq(formSubmissions.formId, forms.id))
    .groupBy(forms.id));
  let changed = 0;
  await dbTransaction(async (tx) => {
    for (const row of rows) {
      const result = await dbRun(tx.update(forms)
        .set({ submissionCount: Number(row.count) })
        .where(and(eq(forms.id, row.id), sql`${forms.submissionCount} <> ${Number(row.count)}`)));
      changed += result.changes;
    }
  });
  return changed;
}

export async function runFormMaintenance() {
  const rows = await dbAll<typeof forms.$inferSelect>(db.select().from(forms));
  let expiredSubmissions = 0;
  for (const row of rows) expiredSubmissions += await cleanupExpiredFormSubmissions(safeFormRecord(row));
  return { expiredSubmissions, recalibratedForms: await recalibrateFormSubmissionCounts() };
}

export async function listFormSubmissions(formId: number, actor: Actor, options?: { page?: number; pageSize?: number }) {
  let form = await getForm(formId, actor);
  if (form.retentionDays) {
    await cleanupExpiredFormSubmissions(form);
    form = await getForm(formId, actor);
  }
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const rows = await dbAll(
    db.select().from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .orderBy(sql`${formSubmissions.submittedAt} desc`)
      .limit(pageSize + 1)
      .offset(offset)
  );

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
    await cleanupExpiredFormSubmissions(form);
    form = await getForm(formId, actor);
  }

  const rows = await dbAll(
    db.select().from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .orderBy(sql`${formSubmissions.submittedAt} desc`)
  );

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

// ===== IP 统计 =====
export interface IpStats {
  ip: string;
  count: number;
  firstAt: Date;
  lastAt: Date;
}

export async function getFormIpStats(formId: number, actor: Actor) {
  await getForm(formId, actor);

  const rows = await dbAll(
    db.select({
      ip: formSubmissions.ip,
      count: sql<number>`count(*)`,
      firstAt: sql<Date>`min(${formSubmissions.submittedAt})`,
      lastAt: sql<Date>`max(${formSubmissions.submittedAt})`
    })
      .from(formSubmissions)
      .where(eq(formSubmissions.formId, formId))
      .groupBy(formSubmissions.ip)
      .orderBy(sql`count(*) desc`)
      .limit(100)
  );

  return rows.map(row => ({
    ip: row.ip,
    count: row.count,
    firstAt: row.firstAt,
    lastAt: row.lastAt
  })) as IpStats[];
}

async function cleanupExpiredFormSubmissions(form: FormRecord) {
  if (!form.retentionDays) return 0;
  const cutoff = new Date(Date.now() - form.retentionDays * 24 * 60 * 60 * 1000);
  return await dbTransaction(async (tx) => {
    const removed = await dbRun(tx.delete(formSubmissions)
      .where(and(eq(formSubmissions.formId, form.id), lt(formSubmissions.submittedAt, cutoff))));
    if (removed.changes > 0) {
      await dbRun(tx.update(forms).set({
        submissionCount: sql`CASE WHEN ${forms.submissionCount} >= ${removed.changes} THEN ${forms.submissionCount} - ${removed.changes} ELSE 0 END`
      }).where(eq(forms.id, form.id)));
    }
    return removed.changes;
  });
}
