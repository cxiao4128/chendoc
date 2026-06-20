import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import {
  createForm,
  deleteForm,
  deleteSubmission,
  deleteAllFormSubmissions,
  exportFormSubmissions,
  getForm,
  listFormSubmissions,
  listForms,
  publishForm,
  closeForm,
  updateForm,
  getFormIpStats
} from "./forms.service.js";
import { renderFormPage, renderFormUnavailablePage } from "./forms.public.js";

export async function formsRoutes(app: FastifyInstance) {
  // ===== 认证路由 =====
  const authHandler = [authenticate];

  // 创建表单
  app.post("/api/forms", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const form = await createForm({ id: user.id, role: user.role }, request.body);
    await writeAuditLog({
      userId: user.id,
      action: "form.create",
      targetType: "form",
      targetId: form.id,
      ...auditMetaFromRequest(request)
    });
    return { form };
  });

  // 表单列表
  app.get("/api/forms", { preHandler: authHandler }, async (request) => {
    const user = request.user!;
    const forms = await listForms({ id: user.id, role: user.role });
    return { forms };
  });

  // 获取表单详情
  app.get("/api/forms/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const form = await getForm(params.id, { id: user.id, role: user.role });
    return { form };
  });

  // 更新表单
  app.put("/api/forms/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const form = await updateForm(params.id, { id: user.id, role: user.role }, request.body);
    return { form };
  });

  // 删除表单
  app.delete("/api/forms/:id", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const result = await deleteForm(params.id, { id: user.id, role: user.role });
    await writeAuditLog({
      userId: user.id,
      action: "form.delete",
      targetType: "form",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return result;
  });

  // 发布表单
  app.post("/api/forms/:id/publish", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = z.object({ action: z.enum(["publish", "close"]) }).parse(request.body ?? {});
    const user = request.user!;
    const form = body.action === "close"
      ? await closeForm(params.id, { id: user.id, role: user.role })
      : await publishForm(params.id, { id: user.id, role: user.role });
    await writeAuditLog({
      userId: user.id,
      action: `form.${body.action}`,
      targetType: "form",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { form };
  });

  // 提交列表
  app.get("/api/forms/:id/submissions", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const query = z.object({
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional()
    }).parse(request.query);
    const user = request.user!;
    const result = await listFormSubmissions(params.id, { id: user.id, role: user.role }, query);
    return result;
  });

  // 导出数据
  app.get("/api/forms/:id/export", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const query = z.object({ format: z.enum(["csv", "json", "xlsx"]).optional() }).parse(request.query);
    const user = request.user!;
    const result = await exportFormSubmissions(params.id, { id: user.id, role: user.role }, query.format ?? "csv");
    await writeAuditLog({
      userId: user.id,
      action: "form.submissions.export",
      targetType: "form",
      targetId: params.id,
      riskLevel: "medium",
      ...auditMetaFromRequest(request)
    });
    return result;
  });

  // IP统计
  app.get("/api/forms/:id/ip-stats", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const stats = await getFormIpStats(params.id, { id: user.id, role: user.role });
    return { stats };
  });

  // 删除单条提交记录
  app.delete("/api/forms/:id/submissions/:submissionId", { preHandler: authHandler }, async (request) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      submissionId: z.coerce.number().int().positive()
    }).parse(request.params);
    const user = request.user!;
    const result = await deleteSubmission(params.id, params.submissionId, { id: user.id, role: user.role });
    await writeAuditLog({ userId: user.id, action: "form.submission.delete", targetType: "form_submission", targetId: params.submissionId, riskLevel: "high", ...auditMetaFromRequest(request) });
    return result;
  });

  app.delete("/api/forms/:id/submissions", { preHandler: authHandler }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const user = request.user!;
    const result = await deleteAllFormSubmissions(params.id, { id: user.id, role: user.role });
    await writeAuditLog({ userId: user.id, action: "form.submissions.delete_all", targetType: "form", targetId: params.id, riskLevel: "high", detail: result, ...auditMetaFromRequest(request) });
    return result;
  });
}
