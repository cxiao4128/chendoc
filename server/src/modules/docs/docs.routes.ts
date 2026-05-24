import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import { auditMetaFromRequest, writeAuditLog } from "../../utils/auditLog.js";
import {
  createDoc,
  bulkSoftDeleteDocs,
  getDoc,
  hardDeleteDoc,
  listDocs,
  listDocVersions,
  listTrashDocs,
  publishDoc,
  restoreDoc,
  restoreDocVersion,
  softDeleteDoc,
  updateDoc
} from "./docs.service.js";

export async function docsRoutes(app: FastifyInstance) {
  const adminOnly = [authenticate, requireAdmin];
  app.get("/api/docs", { preHandler: authenticate }, async (request) => {
    const query = z.object({ q: z.string().optional() }).parse(request.query);
    return { docs: await listDocs(request.user!, query.q) };
  });
  app.get("/api/docs/search", { preHandler: authenticate }, async (request) => {
    const query = z.object({ q: z.string().optional() }).parse(request.query);
    return { docs: await listDocs(request.user!, query.q) };
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
  app.get("/api/admin/docs/trash", { preHandler: adminOnly }, async () => ({ docs: await listTrashDocs() }));
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
    const doc = await restoreDoc(params.id, request.user!.id);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.restore",
      targetType: "doc",
      targetId: params.id,
      ...auditMetaFromRequest(request)
    });
    return { doc };
  });
  app.delete("/api/admin/docs/:id/hard", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    await hardDeleteDoc(params.id);
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
