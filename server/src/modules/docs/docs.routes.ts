import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/requireAdmin.js";
import {
  createDoc,
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
    return { docs: listDocs(request.user!, query.q) };
  });
  app.get("/api/docs/search", { preHandler: authenticate }, async (request) => {
    const query = z.object({ q: z.string().optional() }).parse(request.query);
    return { docs: listDocs(request.user!, query.q) };
  });
  app.post("/api/docs", { preHandler: authenticate }, async (request) => ({ doc: createDoc(request.user!.id, request.body) }));
  app.get("/api/admin/docs/trash", { preHandler: adminOnly }, async () => ({ docs: listTrashDocs() }));
  app.get("/api/docs/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { doc: getDoc(params.id, request.user!) };
  });
  app.patch("/api/docs/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { doc: updateDoc(params.id, request.user!.id, request.body, request.user!) };
  });
  app.delete("/api/docs/:id", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    softDeleteDoc(params.id, request.user!.id, request.user!);
    return { ok: true };
  });
  app.post("/api/admin/docs/:id/restore", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { doc: restoreDoc(params.id, request.user!.id) };
  });
  app.delete("/api/admin/docs/:id/hard", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    hardDeleteDoc(params.id);
    return { ok: true };
  });
  app.post("/api/docs/:id/publish", { preHandler: adminOnly }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { doc: publishDoc(params.id, request.user!.id) };
  });
  app.get("/api/docs/:id/versions", { preHandler: authenticate }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return { versions: listDocVersions(params.id, request.user!) };
  });
  app.post("/api/docs/:id/versions/:versionId/restore", { preHandler: authenticate }, async (request) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      versionId: z.coerce.number().int().positive()
    }).parse(request.params);
    return { doc: restoreDocVersion(params.id, params.versionId, request.user!.id, request.user!) };
  });
}
