// ChenDoc v2.10.0 - 文档全文搜索服务
// 支持对文档内容进行全文搜索

import { and, desc, eq, isNull, like, sql, type SQL } from "drizzle-orm";
import { db, dbAll } from "../../db/client.js";
import { docs, shares, users } from "../../db/schema.js";
import { decryptDocumentRecord } from "../../utils/documentCrypto.js";
import type { DocumentActor } from "./documentAccess.js";

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

// 辅助函数：检查文本是否包含搜索关键词
function textContainsQuery(text: string, query: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(query.toLowerCase());
}

// 辅助函数：获取文本中关键词周围的上下文
function getSnippet(text: string, query: string, maxLength = 150): string {
  if (!text) return "";
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
  }

  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + query.length + 100);
  let snippet = text.slice(start, end);

  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}

export interface SearchResult {
  id: number;
  docUid: string;
  title: string;
  summary?: string;
  snippet: string;
  tags?: string[];
  updatedAt: Date;
  createdAt: Date;
}

export interface FullTextSearchOptions {
  page?: number;
  pageSize?: number;
  maxResults?: number;
}

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_RESULTS = 500;

function normalizeSearchQuery(query: string): string {
  // 清理搜索查询
  return query.trim().slice(0, 100);
}

function queryAccessWhere(actor: DocumentActor): SQL<unknown> {
  if (actor.isSuperAdmin) return isNull(docs.deletedAt);
  return and(isNull(docs.deletedAt), eq(docs.ownerId, actor.id)) as SQL<unknown>;
}

function selectFields() {
  return {
    id: docs.id,
    docUid: docs.docUid,
    title: docs.title,
    summary: docs.summary,
    contentHtmlCiphertext: docs.contentHtmlCiphertext,
    contentHtmlIv: docs.contentHtmlIv,
    contentHtmlTag: docs.contentHtmlTag,
    contentHtmlKeyVersion: docs.contentHtmlKeyVersion,
    tags: docs.tags,
    ownerId: docs.ownerId,
    updatedAt: docs.updatedAt,
    createdAt: docs.createdAt,
  };
}

// 全文搜索：搜索文档标题、摘要、标签和内容
export async function searchDocsFullText(
  actor: DocumentActor,
  query: string,
  options: FullTextSearchOptions = {}
): Promise<{ results: SearchResult[]; total: number; hasMore: boolean }> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return { results: [], total: 0, hasMore: false };
  }

  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(options.pageSize) || DEFAULT_PAGE_SIZE)));
  const maxResults = Math.min(MAX_SEARCH_RESULTS, Math.max(1, options.maxResults || MAX_SEARCH_RESULTS));

  const accessWhere = queryAccessWhere(actor);

  // 第一步：获取候选文档（通过标题、摘要、标签快速筛选）
  const candidateQuery = `%${normalizedQuery}%`;
  const candidates = await dbAll(
    db.select(selectFields())
      .from(docs)
      .leftJoin(users, eq(docs.ownerId, users.id))
      .where(and(
        accessWhere,
        sql`(title LIKE ${candidateQuery} OR summary LIKE ${candidateQuery} OR tags LIKE ${candidateQuery})`
      ))
      .orderBy(desc(docs.updatedAt))
      .limit(maxResults)
  );

  if (candidates.length === 0) {
    return { results: [], total: 0, hasMore: false };
  }

  // 第二步：批量解密并搜索内容
  const matchedResults: SearchResult[] = [];
  const queryLower = normalizedQuery.toLowerCase();

  for (const candidate of candidates) {
    try {
      // 解密文档内容
      const decrypted = decryptDocumentRecord({
        contentHtmlCiphertext: candidate.contentHtmlCiphertext,
        contentHtmlIv: candidate.contentHtmlIv,
        contentHtmlTag: candidate.contentHtmlTag,
        contentHtmlKeyVersion: candidate.contentHtmlKeyVersion,
      } as any);

      // 搜索内容
      const contentText = stripHtml(decrypted.contentHtml || "");

      // 检查是否匹配
      if (textContainsQuery(contentText, normalizedQuery)) {
        // 解析标签
        let tags: string[] | undefined;
        try {
          tags = JSON.parse(candidate.tags || "[]");
        } catch {
          tags = [];
        }

        matchedResults.push({
          id: candidate.id,
          docUid: candidate.docUid,
          title: candidate.title || "未命名文档",
          summary: candidate.summary || undefined,
          snippet: getSnippet(contentText, normalizedQuery),
          tags,
          updatedAt: candidate.updatedAt,
          createdAt: candidate.createdAt,
        });

        // 达到最大结果数时停止
        if (matchedResults.length >= maxResults) break;
      }
    } catch (error) {
      // 解密失败，跳过此文档
      console.warn(`解密文档 ${candidate.id} 失败:`, error);
    }
  }

  // 分页
  const offset = (page - 1) * pageSize;
  const total = matchedResults.length;
  const pagedResults = matchedResults.slice(offset, offset + pageSize);

  return {
    results: pagedResults,
    total,
    hasMore: offset + pagedResults.length < total,
  };
}

// 快速搜索：仅搜索标题、摘要、标签（不解密内容）
export async function searchDocsQuick(
  actor: DocumentActor,
  query: string,
  options: FullTextSearchOptions = {}
): Promise<{ results: SearchResult[]; total: number; hasMore: boolean }> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return { results: [], total: 0, hasMore: false };
  }

  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(options.pageSize) || DEFAULT_PAGE_SIZE)));
  const maxResults = Math.min(MAX_SEARCH_RESULTS, Math.max(1, options.maxResults || MAX_SEARCH_RESULTS));

  const accessWhere = queryAccessWhere(actor);
  const candidateQuery = `%${normalizedQuery}%`;

  // 直接查询匹配标题、摘要、标签的文档
  const candidates = await dbAll(
    db.select(selectFields())
      .from(docs)
      .leftJoin(users, eq(docs.ownerId, users.id))
      .where(and(
        accessWhere,
        sql`(title LIKE ${candidateQuery} OR summary LIKE ${candidateQuery} OR tags LIKE ${candidateQuery})`
      ))
      .orderBy(desc(docs.updatedAt))
      .limit(maxResults)
  );

  const results: SearchResult[] = candidates.map(candidate => {
    let tags: string[] | undefined;
    try {
      tags = JSON.parse(candidate.tags || "[]");
    } catch {
      tags = [];
    }

    // 从摘要中提取片段
    const snippet = candidate.summary
      ? getSnippet(candidate.summary, normalizedQuery, 200)
      : "";

    return {
      id: candidate.id,
      docUid: candidate.docUid,
      title: candidate.title || "未命名文档",
      summary: candidate.summary || undefined,
      snippet,
      tags,
      updatedAt: candidate.updatedAt,
      createdAt: candidate.createdAt,
    };
  });

  const total = results.length;
  const offset = (page - 1) * pageSize;
  const pagedResults = results.slice(offset, offset + pageSize);

  return {
    results: pagedResults,
    total,
    hasMore: offset + pagedResults.length < total,
  };
}