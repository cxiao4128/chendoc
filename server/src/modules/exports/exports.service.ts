// ChenDoc v2.10.0 - 批量导出服务
// 提供文档批量导出的服务端功能

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, dbAll } from "../../db/client.js";
import { docs, docVersions, shares } from "../../db/schema.js";
import { decryptDocumentRecord } from "../../utils/documentCrypto.js";
import type { DocumentActor } from "../docs/documentAccess.js";

// 移除 HTML 标签获取纯文本
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// HTML 转 Markdown（简化实现）
function htmlToMarkdown(html: string): string {
  let md = html;

  // 标题
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n");
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n");
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n");

  // 粗体和斜体
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");

  // 链接
  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // 图片
  md = md.replace(/<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, "![$2]($1)");
  md = md.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*>/gi, "![$1]($2)");
  md = md.replace(/<img[^>]*src=["']([^"']*)["'][^>]*>/gi, "![]($1)");

  // 代码块
  md = md.replace(/<pre[^>]*><code[^>]*class=["']language-(\w+)["'][^>]*>([\s\S]*?)<\/code><\/pre>/gi, "```$1\n$2\n```\n");
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "```\n$1\n```\n");
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");

  // 列表
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n") + "\n";
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
    let index = 0;
    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${++index}. $1\n`) + "\n";
  });

  // 引用
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, (_match: string, content: string) => {
    return content.split("\n").map((line: string) => `> ${line}`).join("\n") + "\n\n";
  });

  // 段落和换行
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // 表格（简化）
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match) => {
    const rows: string[][] = [];
    const rowMatches = match.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    for (const rowMatch of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
      for (const cellMatch of cellMatches) {
        cells.push(stripHtml(cellMatch[1]).trim());
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length === 0) return "";
    const header = rows[0].map(c => `**${c}**`).join(" | ");
    const separator = rows[0].map(() => "---").join(" | ");
    const body = rows.slice(1).map(row => row.join(" | ")).join("\n");
    return `${header}\n${separator}\n${body}\n\n`;
  });

  // 移除剩余标签
  md = stripHtml(md);

  // 清理多余空行
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

export interface ExportDocument {
  id: number;
  docUid: string;
  title: string;
  summary?: string;
  contentHtml: string;
  contentJson: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportResult {
  success: boolean;
  documents?: ExportDocument[];
  error?: string;
}

function queryAccessWhere(actor: DocumentActor, docIds: number[]): ReturnType<typeof eq> | ReturnType<typeof sql> {
  if (actor.isSuperAdmin) return inArray(docs.id, docIds);
  return and(inArray(docs.id, docIds), eq(docs.ownerId, actor.id))!;
}

function queryAccessByUid(actor: DocumentActor): ReturnType<typeof eq> | ReturnType<typeof sql> {
  if (actor.isSuperAdmin) return sql`1=1`;
  return eq(docs.ownerId, actor.id);
}

// 获取要导出的文档
export async function getDocumentsForExport(
  actor: DocumentActor,
  docIds: number[]
): Promise<ExportDocument[]> {
  if (docIds.length === 0) return [];

  const uniqueIds = [...new Set(docIds)].slice(0, 100); // 限制最多 100 个
  const accessWhere = queryAccessWhere(actor, uniqueIds);

  const rows = await dbAll(
    db.select({
      id: docs.id,
      docUid: docs.docUid,
      title: docs.title,
      summary: docs.summary,
      contentJsonCiphertext: docs.contentJsonCiphertext,
      contentJsonIv: docs.contentJsonIv,
      contentJsonTag: docs.contentJsonTag,
      contentJsonKeyVersion: docs.contentJsonKeyVersion,
      contentHtmlCiphertext: docs.contentHtmlCiphertext,
      contentHtmlIv: docs.contentHtmlIv,
      contentHtmlTag: docs.contentHtmlTag,
      contentHtmlKeyVersion: docs.contentHtmlKeyVersion,
      tags: docs.tags,
      createdAt: docs.createdAt,
      updatedAt: docs.updatedAt,
    })
      .from(docs)
      .where(and(accessWhere, isNull(docs.deletedAt)))
      .orderBy(desc(docs.updatedAt))
  );

  return decryptAndMapDocs(rows);
}

// 通过 docUid 获取文档
export async function getDocumentByUid(
  actor: DocumentActor,
  docUid: string
): Promise<ExportDocument | null> {
  const accessWhere = queryAccessByUid(actor);

  const rows = await dbAll(
    db.select({
      id: docs.id,
      docUid: docs.docUid,
      title: docs.title,
      summary: docs.summary,
      contentJsonCiphertext: docs.contentJsonCiphertext,
      contentJsonIv: docs.contentJsonIv,
      contentJsonTag: docs.contentJsonTag,
      contentJsonKeyVersion: docs.contentJsonKeyVersion,
      contentHtmlCiphertext: docs.contentHtmlCiphertext,
      contentHtmlIv: docs.contentHtmlIv,
      contentHtmlTag: docs.contentHtmlTag,
      contentHtmlKeyVersion: docs.contentHtmlKeyVersion,
      tags: docs.tags,
      createdAt: docs.createdAt,
      updatedAt: docs.updatedAt,
    })
      .from(docs)
      .where(and(eq(docs.docUid, docUid), accessWhere, isNull(docs.deletedAt)))
  );

  const results = decryptAndMapDocs(rows);
  return results[0] || null;
}

function decryptAndMapDocs(rows: any[]): ExportDocument[] {
  const results: ExportDocument[] = [];

  for (const row of rows) {
    try {
      const decrypted = decryptDocumentRecord(row as any);

      // 解析标签
      let tags: string[] | undefined;
      try {
        tags = JSON.parse(row.tags || "[]");
      } catch {
        tags = [];
      }

      results.push({
        id: row.id,
        docUid: row.docUid,
        title: row.title || "未命名文档",
        summary: row.summary || undefined,
        contentHtml: decrypted.contentHtml || "",
        contentJson: decrypted.contentJson || "",
        tags,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    } catch (error) {
      console.warn(`导出文档 ${row.id} 解密失败:`, error);
    }
  }

  return results;
}

// 导出为 Markdown
export function exportAsMarkdown(doc: ExportDocument, includeMetadata = true): string {
  const title = doc.title || "未命名文档";
  const content = htmlToMarkdown(doc.contentHtml);
  const metadata = includeMetadata
    ? `---\ntitle: "${title}"\nsummary: "${doc.summary || ""}"\ntags: [${(doc.tags || []).map(t => `"${t}"`).join(", ")}]\ncreated: "${doc.createdAt.toISOString()}"\nupdated: "${doc.updatedAt.toISOString()}"\n---\n\n`
    : "";

  return `${metadata}# ${title}\n\n${content}`;
}

// 导出为 HTML
export function exportAsHtml(doc: ExportDocument, includeMetadata = true): string {
  const title = doc.title || "未命名文档";
  const content = doc.contentHtml;
  const metadata = includeMetadata ? `
      <meta name="author" content="ChenDoc">
      <meta name="created" content="${doc.createdAt.toISOString()}">
      <meta name="modified" content="${doc.updatedAt.toISOString()}">
    ` : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>${metadata}
  <style>
    body {
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
    }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 4px; overflow-x: auto; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
    img { max-width: 100%; height: auto; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${content}
</body>
</html>`;
}

// 导出为 JSON
export function exportAsJson(doc: ExportDocument, includeMetadata = true): string {
  const data = includeMetadata
    ? {
        title: doc.title,
        summary: doc.summary,
        contentHtml: doc.contentHtml,
        contentJson: doc.contentJson,
        tags: doc.tags,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      }
    : {
        title: doc.title,
        contentHtml: doc.contentHtml,
      };

  return JSON.stringify(data, null, 2);
}

// 获取文件名（安全化）
export function getSafeFileName(title: string, extension: string): string {
  return (title || "未命名文档")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 100) + `.${extension}`;
}