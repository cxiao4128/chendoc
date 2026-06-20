import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { requireDangerVerification } from "../auth/dangerVerification.service.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import { enqueueDocumentLog } from "../../utils/asyncLogQueue.js";
import {
  createDoc,
  bulkHardDeleteTrashDocsByUid,
  bulkRestoreDocsByUid,
  bulkSoftDeleteDocsByUid,
  getDocByUid,
  getDocVersionPreviewByUid,
  getTrashStats,
  hardDeleteDocByUid,
  listDocsPage,
  listDocVersionsByUid,
  listTrashDocsPage,
  publishDocByUid,
  restoreDocByUid,
  restoreDocVersionByUid,
  restoreDocVersionAsCopyByUid,
  safeDocListPayload,
  safeDocPayload,
  softDeleteDocByUid,
  updateDocByUid
} from "./docs.service.js";

export async function docsRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];
  const dangerousAdmin = [authenticate, requireAdmin, requireDangerVerification];
  const listQuerySchema = z.object({
    q: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(50).default(30)
  });
  const docUidSchema = z.string().trim().regex(/^[A-Za-z0-9]{16,32}$/);
  const docUidParamSchema = z.object({ docUid: docUidSchema });
  const trashBulkSchema = z.object({
    docUids: z.array(docUidSchema).min(1).max(200)
  });

  app.get("/api/docs", { preHandler: authenticate }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const result = await listDocsPage(request.user!, query.q, query);
    return { ...result, docs: safeDocListPayload(result.docs) };
  });
  app.get("/api/docs/search", { preHandler: authenticate }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const result = await listDocsPage(request.user!, query.q, query);
    enqueueDocumentLog({
      userId: request.user!.id,
      role: request.user!.role,
      ownerId: request.user!.id,
      action: "search",
      request
    });
    return { ...result, docs: safeDocListPayload(result.docs) };
  });
  app.post("/api/docs", { preHandler: authenticate }, async (request) => {
    const doc = await createDoc(request.user!.id, request.body, request.user!);
    enqueueDocumentLog({
      userId: request.user!.id,
      role: request.user!.role,
      docUid: doc.docUid,
      ownerId: doc.ownerId,
      action: "create",
      request
    });
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.create",
      targetType: "doc",
      targetId: doc.docUid,
      ...auditMetaFromRequest(request)
    });
    return { doc: safeDocPayload(doc) };
  });
  app.post("/api/docs/bulk-delete", { preHandler: authenticate }, async (request) => {
    const body = trashBulkSchema.parse(request.body);
    const deletedDocUids = await bulkSoftDeleteDocsByUid(body.docUids, request.user!.id, request.user!);
    if (deletedDocUids.length) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "doc.bulk_soft_delete",
        targetType: "doc",
        targetId: `count:${deletedDocUids.length}`,
        ...auditMetaFromRequest(request)
      });
    }
    return { ok: true, deletedDocUids };
  });
  app.get("/api/docs/trash", { preHandler: authenticate }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const result = await listTrashDocsPage(request.user!, query);
    return { ...result, docs: safeDocListPayload(result.docs) };
  });
  app.get("/api/admin/docs/trash", { preHandler: adminOnly }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const result = await listTrashDocsPage(request.user!, query);
    return { ...result, docs: safeDocListPayload(result.docs) };
  });
  app.get("/api/admin/docs/trash/stats", { preHandler: adminOnly }, async (request) => {
    const stats = await getTrashStats(request.user!);
    return stats;
  });
  app.post("/api/docs/trash/batch-restore", { preHandler: authenticate }, async (request) => {
    const body = trashBulkSchema.parse(request.body);
    const restoredDocUids = await bulkRestoreDocsByUid(body.docUids, request.user!.id, request.user!);
    if (restoredDocUids.length) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "doc.bulk_restore",
        targetType: "doc",
        targetId: `count:${restoredDocUids.length}`,
        ...auditMetaFromRequest(request)
      });
    }
    return { success: true, restored: restoredDocUids.length, restoredDocUids };
  });
  app.post("/api/docs/trash/batch-delete", { preHandler: authenticate }, async (request) => {
    const body = trashBulkSchema.parse(request.body);
    const deletedDocUids = await bulkHardDeleteTrashDocsByUid(body.docUids, request.user!);
    if (deletedDocUids.length) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "doc.bulk_hard_delete",
        targetType: "doc",
        targetId: `count:${deletedDocUids.length}`,
        ...auditMetaFromRequest(request)
      });
    }
    return { success: true, deleted: deletedDocUids.length, deletedDocUids };
  });
  app.post("/api/admin/docs/trash/bulk-restore", { preHandler: adminOnly }, async (request) => {
    const body = trashBulkSchema.parse(request.body);
    const restoredDocUids = await bulkRestoreDocsByUid(body.docUids, request.user!.id, request.user!);
    if (restoredDocUids.length) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "doc.bulk_restore",
        targetType: "doc",
        targetId: `count:${restoredDocUids.length}`,
        ...auditMetaFromRequest(request)
      });
    }
    return { ok: true, restoredDocUids };
  });
  app.post("/api/admin/docs/trash/bulk-hard-delete", { preHandler: dangerousAdmin }, async (request) => {
    const body = trashBulkSchema.parse(request.body);
    const deletedDocUids = await bulkHardDeleteTrashDocsByUid(body.docUids, request.user!);
    if (deletedDocUids.length) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "doc.bulk_hard_delete",
        targetType: "doc",
        targetId: `count:${deletedDocUids.length}`,
        ...auditMetaFromRequest(request)
      });
    }
    return { ok: true, deletedDocUids };
  });
  app.get("/api/docs/:docUid", { preHandler: authenticate }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    const doc = await getDocByUid(params.docUid, request.user!);
    enqueueDocumentLog({
      userId: request.user!.id,
      role: request.user!.role,
      docUid: doc.docUid,
      ownerId: doc.ownerId,
      action: "read",
      request
    });
    return { doc: safeDocPayload(doc) };
  });
  app.patch("/api/docs/:docUid", { preHandler: authenticate }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    const doc = await updateDocByUid(params.docUid, request.user!.id, request.body, request.user!);
    enqueueDocumentLog({
      userId: request.user!.id,
      role: request.user!.role,
      docUid: doc.docUid,
      ownerId: doc.ownerId,
      action: "update",
      request
    });
    return { doc: safeDocPayload(doc) };
  });
  app.delete("/api/docs/:docUid", { preHandler: authenticate }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    const docLog = await softDeleteDocByUid(params.docUid, request.user!.id, request.user!);
    enqueueDocumentLog({
      userId: request.user!.id,
      role: request.user!.role,
      docUid: docLog.docUid,
      ownerId: docLog.ownerId,
      action: "delete",
      request
    });
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.soft_delete",
      targetType: "doc",
      targetId: params.docUid,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });
  app.post("/api/admin/docs/:docUid/restore", { preHandler: adminOnly }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    const doc = await restoreDocByUid(params.docUid, request.user!.id, request.user!);
    enqueueDocumentLog({
      userId: request.user!.id,
      role: request.user!.role,
      docUid: doc.docUid,
      ownerId: doc.ownerId,
      action: "restore",
      request
    });
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.restore",
      targetType: "doc",
      targetId: params.docUid,
      ...auditMetaFromRequest(request)
    });
    return { doc: safeDocPayload(doc) };
  });
  app.delete("/api/admin/docs/:docUid/hard", { preHandler: dangerousAdmin }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    await hardDeleteDocByUid(params.docUid, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.hard_delete",
      targetType: "doc",
      targetId: params.docUid,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });
  app.post("/api/docs/:docUid/publish", { preHandler: adminOnly }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    const doc = await publishDocByUid(params.docUid, request.user!.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.publish",
      targetType: "doc",
      targetId: params.docUid,
      ...auditMetaFromRequest(request)
    });
    return { doc: safeDocPayload(doc) };
  });
  app.get("/api/docs/:docUid/versions", { preHandler: authenticate }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    return { versions: await listDocVersionsByUid(params.docUid, request.user!) };
  });
  app.get("/api/docs/:docUid/versions/:versionId", { preHandler: authenticate }, async (request) => {
    const params = z.object({ docUid: docUidSchema, versionId: z.coerce.number().int().positive() }).parse(request.params);
    return { version: await getDocVersionPreviewByUid(params.docUid, params.versionId, request.user!) };
  });
  app.post("/api/docs/:docUid/versions/:versionId/restore-copy", { preHandler: authenticate }, async (request) => {
    const params = z.object({ docUid: docUidSchema, versionId: z.coerce.number().int().positive() }).parse(request.params);
    const doc = await restoreDocVersionAsCopyByUid(params.docUid, params.versionId, request.user!.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.version.restore_copy",
      targetType: "doc",
      targetId: doc.docUid,
      ...auditMetaFromRequest(request)
    });
    return { doc: safeDocPayload(doc) };
  });
  app.post("/api/docs/:docUid/versions/:versionId/restore", { preHandler: authenticate }, async (request) => {
    const params = z.object({
      docUid: docUidSchema,
      versionId: z.coerce.number().int().positive()
    }).parse(request.params);
    const doc = await restoreDocVersionByUid(params.docUid, params.versionId, request.user!.id, request.user!);
    enqueueDocumentLog({
      userId: request.user!.id,
      role: request.user!.role,
      docUid: doc.docUid,
      ownerId: doc.ownerId,
      action: "restore",
      request
    });
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.version.restore",
      targetType: "doc",
      targetId: params.docUid,
      ...auditMetaFromRequest(request)
    });
    return { doc: safeDocPayload(doc) };
  });
}
