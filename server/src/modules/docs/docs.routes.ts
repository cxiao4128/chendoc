import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireSuperAdmin } from "../../middleware/requireSuperAdmin.js";
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
  safeDocPayloadForDocWithShare,
  setDocumentSchedule,
  getDocumentSchedule,
  softDeleteDocByUid,
  updateDocByUid
} from "./docs.service.js";
import {
  clearSearchHistory,
  deleteSearchHistoryItem,
  getSearchHistory,
  getSearchHistoryItemById,
  getSearchSuggestions,
  searchDocsFullText,
  searchDocsQuick
} from "./docs.search.service.js";

export const docUidSchema = z.string().trim().regex(/^[A-Za-z0-9]{16,32}$/);
export const listQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(30)
});
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(255),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  sort: z.enum(["relevance", "updatedAt", "createdAt", "viewCount"]).default("relevance"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  includeHighlights: z.coerce.boolean().default(true),
  mode: z.enum(["fulltext", "quick"]).default("fulltext"),
  // 高级过滤
  status: z.enum(["draft", "published", "archived"]).optional(),
  tags: z.string().optional(), // 逗号分隔的标签列表
  dateFrom: z.string().optional(), // ISO 日期格式
  dateTo: z.string().optional()
});
export const suggestionsQuerySchema = z.object({
  q: z.string().min(1).max(255),
  limit: z.coerce.number().int().positive().max(20).default(10)
});
export const docUidParamSchema = z.object({ docUid: docUidSchema });
export const trashBulkSchema = z.object({
  docUids: z.array(docUidSchema).min(1).max(200)
});
export const scheduleSchema = z.object({
  scheduledAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  autoArchive: z.boolean().optional()
});

function hashString(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

export async function docsRoutes(app: FastifyInstance) {
  const superAdminOnly = [authenticate, requireSuperAdmin];
  const dangerousSuperAdmin = [authenticate, requireSuperAdmin, requireDangerVerification];

  app.get("/api/docs", { preHandler: authenticate }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const result = await listDocsPage(request.user!, query.q, query);
    return { ...result, docs: safeDocListPayload(result.docs) };
  });
  app.get("/api/docs/search", { preHandler: authenticate }, async (request) => {
    const query = searchQuerySchema.parse(request.query);
    const user = request.user!;
    const ipHash = request.ip ? hashString(request.ip) : undefined;

    // 解析逗号分隔的标签
    const tags = query.tags ? query.tags.split(",").map(t => t.trim()).filter(Boolean) : undefined;

    const result = await searchDocsFullText(
      { id: user.id, role: user.role, isSuperAdmin: user.isSuperAdmin },
      query.q,
      {
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sort,
        sortOrder: query.sortOrder,
        includeHighlights: query.includeHighlights,
        status: query.status,
        tags,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo
      },
      ipHash
    );

    enqueueDocumentLog({
      userId: user.id,
      role: user.role,
      ownerId: user.id,
      action: "search",
      request
    });

    return {
      ...result,
      docs: result.results,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        hasMore: result.hasMore
      }
    };
  });

  app.get("/api/docs/search/quick", { preHandler: authenticate }, async (request) => {
    const query = searchQuerySchema.parse(request.query);
    const user = request.user!;
    const ipHash = request.ip ? hashString(request.ip) : undefined;

    const result = await searchDocsQuick(
      { id: user.id, role: user.role, isSuperAdmin: user.isSuperAdmin },
      query.q,
      {
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sort,
        sortOrder: query.sortOrder
      },
      ipHash
    );

    return {
      ...result,
      docs: result.results,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        hasMore: result.hasMore
      }
    };
  });

  app.get("/api/docs/search/suggestions", { preHandler: authenticate }, async (request) => {
    const query = suggestionsQuerySchema.parse(request.query);
    const suggestions = await getSearchSuggestions(
      request.user!,
      query.q,
      query.limit
    );
    return { suggestions };
  });

  app.get("/api/docs/search/history", { preHandler: authenticate }, async (request) => {
    const query = z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(50).default(20)
    }).parse(request.query);

    const result = await getSearchHistory(request.user!.id, query.pageSize);
    return { history: result, page: query.page, pageSize: query.pageSize };
  });

  app.delete("/api/docs/search/history/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const historyItem = await getSearchHistoryItemById(params.id, request.user!.id);
    if (historyItem) {
      await deleteSearchHistoryItem(request.user!.id, historyItem.query);
    }
    return { ok: true };
  });

  app.delete("/api/docs/search/history", { preHandler: authenticate }, async (request) => {
    await clearSearchHistory(request.user!.id);
    return { ok: true };
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
    return { doc: safeDocPayloadForDocWithShare(doc) };
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
  app.get("/api/admin/docs/trash", { preHandler: superAdminOnly }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const result = await listTrashDocsPage(request.user!, query);
    return { ...result, docs: safeDocListPayload(result.docs) };
  });
  app.get("/api/docs/trash/stats", { preHandler: authenticate }, async (request) => {
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
  app.post("/api/docs/trash/batch-delete", { preHandler: [authenticate, requireDangerVerification] }, async (request) => {
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
  app.post("/api/admin/docs/trash/bulk-restore", { preHandler: superAdminOnly }, async (request) => {
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
  app.post("/api/admin/docs/trash/bulk-hard-delete", { preHandler: dangerousSuperAdmin }, async (request) => {
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
    return { doc: safeDocPayloadForDocWithShare(doc) };
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
    return { doc: safeDocPayloadForDocWithShare(doc) };
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
  app.post("/api/admin/docs/:docUid/restore", { preHandler: superAdminOnly }, async (request) => {
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
    return { doc: safeDocPayloadForDocWithShare(doc) };
  });
  app.delete("/api/admin/docs/:docUid/hard", { preHandler: dangerousSuperAdmin }, async (request) => {
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
  app.post("/api/docs/:docUid/publish", { preHandler: authenticate }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    const doc = await publishDocByUid(params.docUid, request.user!.id, request.user!);
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.publish",
      targetType: "doc",
      targetId: params.docUid,
      ...auditMetaFromRequest(request)
    });
    return { doc: safeDocPayloadForDocWithShare(doc) };
  });
  // 定时发布设置
  app.get("/api/docs/:docUid/schedule", { preHandler: authenticate }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    const schedule = await getDocumentSchedule(params.docUid, request.user!);
    if (!schedule) {
      return { schedule: null };
    }
    return {
      schedule: {
        scheduledAt: schedule.scheduledAt?.toISOString() ?? null,
        expiresAt: schedule.expiresAt?.toISOString() ?? null,
        autoArchive: schedule.autoArchive
      }
    };
  });
  app.put("/api/docs/:docUid/schedule", { preHandler: authenticate }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    const body = scheduleSchema.parse(request.body);
    const schedule = await setDocumentSchedule(
      request.user!,
      params.docUid,
      {
        scheduledAt: body.scheduledAt,
        expiresAt: body.expiresAt,
        autoArchive: body.autoArchive
      }
    );
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.schedule_update",
      targetType: "doc",
      targetId: params.docUid,
      ...auditMetaFromRequest(request)
    });
    return {
      schedule: {
        scheduledAt: schedule.scheduledAt?.toISOString() ?? null,
        expiresAt: schedule.expiresAt?.toISOString() ?? null,
        autoArchive: schedule.autoArchive
      }
    };
  });
  app.delete("/api/docs/:docUid/schedule", { preHandler: authenticate }, async (request) => {
    const params = docUidParamSchema.parse(request.params);
    await setDocumentSchedule(
      request.user!,
      params.docUid,
      { scheduledAt: null, expiresAt: null }
    );
    await writeAuditLog({
      userId: request.user!.id,
      action: "doc.schedule_delete",
      targetType: "doc",
      targetId: params.docUid,
      ...auditMetaFromRequest(request)
    });
    return { ok: true };
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
    return { doc: safeDocPayloadForDocWithShare(doc) };
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
    return { doc: safeDocPayloadForDocWithShare(doc) };
  });
}
