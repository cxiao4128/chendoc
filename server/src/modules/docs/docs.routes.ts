import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { requireDangerVerification } from "../auth/dangerVerification.service.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import {
  createDoc,
  bulkHardDeleteTrashDocs,
  bulkRestoreDocs,
  bulkSoftDeleteDocs,
  getDoc,
  hardDeleteDoc,
  listDocsPage,
  listDocVersions,
  listTrashDocsPage,
  publishDoc,
  restoreDoc,
  restoreDocVersion,
  softDeleteDoc,
  updateDoc
} from "./docs.service.js";

export async function docsRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];
  const dangerousAdmin = [authenticate, requireAdmin, requireDangerVerification];
  const listQuerySchema = z.object({
    q: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(50).default(30)
  });
  const trashBulkSchema = z.object({
    ids: z.array(z.number().int().positive()).min(1).max(200)
  });

  app.get("/api/docs", { preHandler: authenticate }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return await listDocsPage(request.user!, query.q, query);
  });
  app.get("/api/docs/search", { preHandler: authenticate }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return await listDocsPage(request.user!, query.q, query);
  });
  app.post("/api/docs", { preHandler: authenticate }, async (request) => {
    const doc = await createDoc(request.user!.id, request.body);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.create",
      targetType: "doc",
      targetId: doc.id,
      ...auditMetaFromRequest(request)
    });
    return { doc };
  });
  app.post("/api/docs/bulk-delete", { preHandler: authenticate }, async (request) => {
    const body = z.object({
      ids: z.array(z.number().int().positive()).min(1).max(200)
    }).parse(request.body);
    const deletedIds = await bulkSoftDeleteDocs(body.ids, request.user!.id, request.user!);
    if (deletedIds.length) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "doc.bulk_soft_delete",
        targetType: "doc",
        targetId: `count:${deletedIds.length}`,
        ...auditMetaFromRequest(request)
      });
    }
    return { ok: true, deletedIds };
  });
  app.get("/api/docs/trash", { preHandler: authenticate }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return await listTrashDocsPage(request.user!, query);
  });
  app.get("/api/admin/docs/trash", { preHandler: adminOnly }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return await listTrashDocsPage(request.user!, query);
  });
  app.post("/api/docs/trash/batch-restore", { preHandler: authenticate }, async (request) => {
    const body = trashBulkSchema.parse(request.body);
    const restoredIds = await bulkRestoreDocs(body.ids, request.user!.id, request.user!);
    if (restoredIds.length) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "doc.bulk_restore",
        targetType: "doc",
        targetId: `count:${restoredIds.length}`,
        ...auditMetaFromRequest(request)
      });
    }
    return { success: true, restored: restoredIds.length, restoredIds };
  });
  app.post("/api/docs/trash/batch-delete", { preHandler: authenticate }, async (request) => {
    const body = trashBulkSchema.parse(request.body);
    const deletedIds = await bulkHardDeleteTrashDocs(body.ids, request.user!);
    if (deletedIds.length) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "doc.bulk_hard_delete",
        targetType: "doc",
        targetId: `count:${deletedIds.length}`,
        ...auditMetaFromRequest(request)
      });
    }
    return { success: true, deleted: deletedIds.length, deletedIds };
  });
  app.post("/api/admin/docs/trash/bulk-restore", { preHandler: adminOnly }, async (request) => {
    const body = trashBulkSchema.parse(request.body);
    const restoredIds = await bulkRestoreDocs(body.ids, request.user!.id, request.user!);
    if (restoredIds.length) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "doc.bulk_restore",
        targetType: "doc",
        targetId: `count:${restoredIds.length}`,
        ...auditMetaFromRequest(request)
      });
    }
    return { ok: true, restoredIds };
  });
  app.post("/api/admin/docs/trash/bulk-hard-delete", { preHandler: dangerousAdmin }, async (request) => {
    const body = trashBulkSchema.parse(request.body);
    const deletedIds = await bulkHardDeleteTrashDocs(body.ids, request.user!);
    if (deletedIds.length) {
      await writeAuditLog({
        userId: request.user!.id,
        action: "doc.bulk_hard_delete",
        targetType: "doc",
        targetId: `count:${deletedIds.length}`,
        ...auditMetaFromRequest(request)
      });
    }
    return { ok: true, deletedIds };
  });
  app.get("/api/docs/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { doc: await getDoc(params.id, request.user!) };
  });
  app.patch("/api/docs/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { doc: await updateDoc(params.id, request.user!.id, request.body, request.user!) };
  });
  app.delete("/api/docs/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    await softDeleteDoc(params.id, request.user!.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.soft_delete",
      targetType: "doc",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });
  app.post("/api/admin/docs/:id/restore", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const doc = await restoreDoc(params.id, request.user!.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.restore",
      targetType: "doc",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { doc };
  });
  app.delete("/api/admin/docs/:id/hard", { preHandler: dangerousAdmin }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    await hardDeleteDoc(params.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.hard_delete",
      targetType: "doc",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
  });
  app.post("/api/docs/:id/publish", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const doc = await publishDoc(params.id, request.user!.id);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.publish",
      targetType: "doc",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { doc };
  });
  app.get("/api/docs/:id/versions", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { versions: await listDocVersions(params.id, request.user!) };
  });
  app.post("/api/docs/:id/versions/:versionId/restore", { preHandler: authenticate }, async (request) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      versionId: z.coerce.number().int().positive()
    }).parse(request.params);
    const doc = await restoreDocVersion(params.id, params.versionId, request.user!.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.version.restore",
      targetType: "doc",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { doc };
  });
}
