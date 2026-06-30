// ChenDoc v2.10.0 - 导出路由
// 提供文档批量导出的 API 接口

import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import {
  getDocumentsForExport,
  exportAsMarkdown,
  exportAsHtml,
  exportAsJson,
  getSafeFileName,
} from "./exports.service.js";

export async function exportsRoutes(app: FastifyInstance) {
  const authHandler = [authenticate];

  // 导出单个文档（直接下载）
  app.get("/api/export/doc/:docId", { preHandler: authHandler }, async (request, reply: FastifyReply) => {
    const params = z.object({
      docId: z.coerce.number().int().positive(),
    }).parse(request.params);

    const query = z.object({
      format: z.enum(["markdown", "html", "json"]).default("markdown"),
      metadata: z.coerce.boolean().default(true),
    }).parse(request.query || {});

    const actor = request.user!;
    const docs = await getDocumentsForExport(actor, [params.docId]);

    if (docs.length === 0) {
      return reply.code(404).send({ error: "文档不存在或无权访问" });
    }

    const doc = docs[0];
    let content: string;
    let fileName: string;
    let contentType: string;

    switch (query.format) {
      case "html":
        content = exportAsHtml(doc, query.metadata);
        fileName = getSafeFileName(doc.title, "html");
        contentType = "text/html;charset=utf-8";
        break;
      case "json":
        content = exportAsJson(doc, query.metadata);
        fileName = getSafeFileName(doc.title, "json");
        contentType = "application/json;charset=utf-8";
        break;
      default:
        content = exportAsMarkdown(doc, query.metadata);
        fileName = getSafeFileName(doc.title, "md");
        contentType = "text/markdown;charset=utf-8";
    }

    return reply
      .header("Content-Type", contentType)
      .header("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`)
      .send(content);
  });

  // 批量导出文档列表信息
  app.post("/api/export/docs", { preHandler: authHandler }, async (request) => {
    const body = z.object({
      docIds: z.array(z.number().int().positive()).min(1).max(100),
    }).parse(request.body || {});

    const query = z.object({
      format: z.enum(["markdown", "html", "json"]).default("markdown"),
      metadata: z.coerce.boolean().default(true),
    }).parse(request.query || {});

    const actor = request.user!;
    const docs = await getDocumentsForExport(actor, body.docIds);

    // 返回导出信息（包含内容）
    return {
      documents: docs.map(doc => {
        let content: string;
        switch (query.format) {
          case "html":
            content = exportAsHtml(doc, query.metadata);
            break;
          case "json":
            content = exportAsJson(doc, query.metadata);
            break;
          default:
            content = exportAsMarkdown(doc, query.metadata);
        }

        return {
          id: doc.id,
          docUid: doc.docUid,
          title: doc.title,
          fileName: getSafeFileName(doc.title, query.format === "html" ? "html" : query.format === "json" ? "json" : "md"),
          content,
        };
      }),
    };
  });

  // 获取导出文件内容（用于前端下载）
  app.get("/api/export/content", { preHandler: authHandler }, async (request) => {
    const query = z.object({
      docId: z.coerce.number().int().positive(),
      format: z.enum(["markdown", "html", "json"]).default("markdown"),
      metadata: z.coerce.boolean().default(true),
    }).parse(request.query || {});

    const actor = request.user!;
    const docs = await getDocumentsForExport(actor, [query.docId]);

    if (docs.length === 0) {
      return { error: "文档不存在或无权访问" };
    }

    const doc = docs[0];
    let content: string;
    let fileName: string;

    switch (query.format) {
      case "html":
        content = exportAsHtml(doc, query.metadata);
        fileName = getSafeFileName(doc.title, "html");
        break;
      case "json":
        content = exportAsJson(doc, query.metadata);
        fileName = getSafeFileName(doc.title, "json");
        break;
      default:
        content = exportAsMarkdown(doc, query.metadata);
        fileName = getSafeFileName(doc.title, "md");
    }

    return {
      content,
      fileName,
      contentType: query.format === "html"
        ? "text/html;charset=utf-8"
        : query.format === "json"
          ? "application/json;charset=utf-8"
          : "text/markdown;charset=utf-8",
    };
  });
}