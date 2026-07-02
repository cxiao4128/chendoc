// ChenDoc v2.10.0 - 文档全文搜索服务
// 支持对文档内容进行全文搜索，包含高亮、排序、建议和历史记录

import { and, desc, eq, isNull, like, sql, type SQL } from "drizzle-orm";
import { createHash } from "crypto";
import { db, dbAll } from "../../db/client.js";
import { accessLogs, docs, searchHistory, shares, users } from "../../db/schema.js";
import { decryptDocumentRecord } from "../../utils/documentCrypto.js";
import type { DocumentActor } from "./documentAccess.js";

// ============================================================
// 辅助函数
// ============================================================

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

// 计算字符串的 MD5 哈希
function computeHash(str: string): string {
  return createHash("md5").update(str.toLowerCase().trim()).digest("hex");
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

// ============================================================
// 高亮处理
// ============================================================

export interface HighlightedPart {
  text: string;
  highlighted: boolean;
}

/**
 * 对文本进行多关键词高亮处理
 * @param text 原始文本
 * @param keywords 关键词数组（支持空格分隔的多关键词）
 * @param maxLength 最大长度
 * @returns 带高亮标记的文本片段数组
 */
export function highlightText(
  text: string,
  keywords: string[],
  maxLength = 200
): HighlightedPart[] {
  if (!text || !keywords.length) {
    return [{ text, highlighted: false }];
  }

  // 过滤空关键词
  const validKeywords = keywords.filter(k => k.trim().length > 0);
  if (!validKeywords.length) {
    return [{ text, highlighted: false }];
  }

  // 构建正则表达式，匹配所有关键词（不区分大小写）
  const escapedKeywords = validKeywords.map(k =>
    k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const regex = new RegExp(`(${escapedKeywords.join("|")})`, "gi");

  // 找到所有匹配位置
  const matches: Array<{ start: number; end: number; text: string }> = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    });
  }

  if (matches.length === 0) {
    return [{ text: text.slice(0, maxLength), highlighted: false }];
  }

  // 按位置排序
  matches.sort((a, b) => a.start - b.start);

  // 找到包含关键词的最佳窗口
  const firstMatch = matches[0];
  const lastMatch = matches[matches.length - 1];
  const windowStart = Math.max(0, firstMatch.start - 30);
  const windowEnd = Math.min(text.length, lastMatch.end + (maxLength - (lastMatch.end - firstMatch.start)) - 50);

  // 提取窗口文本
  let windowText = text.slice(windowStart, windowEnd);
  let prefix = windowStart > 0 ? "..." : "";
  let suffix = windowEnd < text.length ? "..." : "";

  // 在窗口中重新匹配高亮
  const windowRegex = new RegExp(`(${escapedKeywords.join("|")})`, "gi");
  const parts: HighlightedPart[] = [];
  let lastIndex = 0;
  let matchInWindow;

  while ((matchInWindow = windowRegex.exec(windowText)) !== null) {
    if (matchInWindow.index > lastIndex) {
      parts.push({
        text: windowText.slice(lastIndex, matchInWindow.index),
        highlighted: false
      });
    }
    parts.push({
      text: matchInWindow[0],
      highlighted: true
    });
    lastIndex = matchInWindow.index + matchInWindow[0].length;
  }

  if (lastIndex < windowText.length) {
    parts.push({
      text: windowText.slice(lastIndex),
      highlighted: false
    });
  }

  // 添加前缀和后缀
  if (prefix) {
    parts.unshift({ text: prefix, highlighted: false });
  }
  if (suffix) {
    parts.push({ text: suffix, highlighted: false });
  }

  // 合并相邻的相同类型片段
  const merged: HighlightedPart[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && last.highlighted === part.highlighted) {
      last.text += part.text;
    } else {
      merged.push({ ...part });
    }
  }

  return merged;
}

/**
 * 解析搜索关键词字符串为数组
 */
export function parseKeywords(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter(k => k.length >= 1);
}

// ============================================================
// 接口定义
// ============================================================

export interface SearchResult {
  id: number;
  docUid: string;
  title: string;
  summary?: string;
  snippet: string;
  titleHighlighted?: HighlightedPart[];
  snippetHighlighted?: HighlightedPart[];
  tags?: string[];
  updatedAt: Date;
  createdAt: Date;
  viewCount?: number;  // 访问频率
  relevanceScore?: number;  // 相关性分数
}

export interface FullTextSearchOptions {
  page?: number;
  pageSize?: number;
  maxResults?: number;
  sortBy?: "relevance" | "updatedAt" | "createdAt" | "viewCount";
  sortOrder?: "asc" | "desc";
  includeHighlights?: boolean;
  // 高级过滤
  status?: "draft" | "published" | "archived";
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchSuggestion {
  keyword: string;
  count: number;
}

export interface SearchHistoryItem {
  id: number;
  query: string;
  searchMode: string;
  resultCount: number;
  searchTime: number;
  createdAt: Date;
}

// ============================================================
// 常量
// ============================================================

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_RESULTS = 500;
const MAX_SUGGESTIONS = 10;
const MAX_HISTORY_ITEMS = 50;

function normalizeSearchQuery(query: string): string {
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

// ============================================================
// 搜索历史记录
// ============================================================

/**
 * 记录搜索历史
 */
export async function recordSearchHistory(
  userId: number,
  query: string,
  searchMode: "fulltext" | "quick" | "suggestions",
  resultCount: number,
  searchTime: number,
  ipHash?: string
): Promise<void> {
  const queryHash = computeHash(query);
  const now = new Date();

  try {
    // 使用 UPSERT 逻辑：更新已存在的记录或插入新记录
    await dbAll(sql`
      INSERT INTO search_history (user_id, query, query_hash, search_mode, result_count, search_time, ip_hash, created_at)
      VALUES (${userId}, ${query}, ${queryHash}, ${searchMode}, ${resultCount}, ${searchTime}, ${ipHash || null}, ${now.toISOString()})
      ON CONFLICT(user_id, query_hash)
      DO UPDATE SET
        result_count = ${resultCount},
        search_time = ${searchTime},
        ip_hash = ${ipHash || null},
        created_at = ${now.toISOString()}
    `);
  } catch {
    // 静默失败，不影响搜索功能
    console.warn("Failed to record search history");
  }
}

/**
 * 获取用户搜索历史
 */
export async function getSearchHistory(
  userId: number,
  limit: number = MAX_HISTORY_ITEMS
): Promise<SearchHistoryItem[]> {
  const results = await dbAll(sql`
    SELECT id, query, search_mode, result_count, search_time, created_at
    FROM search_history
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${Math.min(limit, MAX_HISTORY_ITEMS)}
  `);

  return results.map(r => ({
    id: r.id as number,
    query: r.query as string,
    searchMode: r.search_mode as string,
    resultCount: r.result_count as number,
    searchTime: r.search_time as number,
    createdAt: new Date(r.created_at as string)
  }));
}

/**
 * 删除单条搜索历史
 */
export async function deleteSearchHistoryItem(
  userId: number,
  query: string
): Promise<void> {
  const queryHash = computeHash(query);
  await db.run(sql`DELETE FROM search_history WHERE user_id = ${userId} AND query_hash = ${queryHash}`).execute();
}

/**
 * 清空用户搜索历史
 */
export async function clearSearchHistory(userId: number): Promise<void> {
  await db.run(sql`DELETE FROM search_history WHERE user_id = ${userId}`).execute();
}

// ============================================================
// 搜索建议/自动补全
// ============================================================

/**
 * 获取搜索建议（基于历史记录和热门搜索词）
 */
export async function getSearchSuggestions(
  userId: number,
  prefix: string,
  limit: number = MAX_SUGGESTIONS
): Promise<SearchSuggestion[]> {
  if (!prefix || prefix.trim().length < 1) {
    return [];
  }

  const normalizedPrefix = prefix.toLowerCase().trim();

  // 从用户搜索历史中获取建议
  const historyResults = await dbAll(sql`
    SELECT query, COUNT(*) as count
    FROM search_history
    WHERE user_id = ${userId}
      AND LOWER(query) LIKE ${normalizedPrefix + '%'}
    GROUP BY query
    ORDER BY count DESC, MAX(created_at) DESC
    LIMIT ${limit}
  `);

  // 如果历史记录足够，直接返回
  if (historyResults.length >= limit) {
    return historyResults.slice(0, limit).map(r => ({
      keyword: r.query as string,
      count: r.count as number
    }));
  }

  // 从文档标题和标签中获取建议
  const docSuggestions = await dbAll(sql`
    SELECT title as suggestion FROM docs
    WHERE deleted_at IS NULL
      AND LOWER(title) LIKE ${normalizedPrefix + '%'}
    UNION
    SELECT DISTINCT json_each.value as suggestion
    FROM docs, json_each(tags)
    WHERE deleted_at IS NULL
      AND LOWER(json_each.value) LIKE ${normalizedPrefix + '%'}
    LIMIT ${limit * 2}
  `);

  // 合并并去重
  const seen = new Set<string>();
  const suggestions: SearchSuggestion[] = [];

  // 先添加历史记录中的建议
  for (const r of historyResults) {
    const keyword = r.query as string;
    if (!seen.has(keyword.toLowerCase())) {
      seen.add(keyword.toLowerCase());
      suggestions.push({
        keyword,
        count: r.count as number
      });
    }
  }

  // 再添加文档标题/标签建议
  for (const r of docSuggestions) {
    const keyword = (r.suggestion as string).trim();
    if (keyword && !seen.has(keyword.toLowerCase())) {
      seen.add(keyword.toLowerCase());
      suggestions.push({
        keyword,
        count: 1
      });
      if (suggestions.length >= limit) break;
    }
  }

  return suggestions.slice(0, limit);
}

// ============================================================
// 全文搜索
// ============================================================

/**
 * 计算相关性分数（简单实现）
 * - 标题匹配: +10 分/关键词
 * - 摘要匹配: +5 分/关键词
 * - 标签匹配: +3 分/关键词
 * - 内容匹配: +1 分/关键词
 */
function calculateRelevanceScore(
  title: string,
  summary: string | null,
  tags: string,
  contentText: string,
  keywords: string[]
): number {
  let score = 0;
  const lowerTitle = title.toLowerCase();
  const lowerSummary = (summary || "").toLowerCase();
  const lowerTags = tags.toLowerCase();
  const lowerContent = contentText.toLowerCase();

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();

    // 标题匹配（最高权重）
    const titleMatches = (lowerTitle.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    score += titleMatches * 10;

    // 摘要匹配
    const summaryMatches = (lowerSummary.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    score += summaryMatches * 5;

    // 标签匹配
    const tagMatches = (lowerTags.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    score += tagMatches * 3;

    // 内容匹配
    const contentMatches = (lowerContent.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    score += Math.min(contentMatches, 10) * 1; // 限制内容匹配的分数贡献
  }

  return score;
}

/**
 * 获取文档访问次数（单个）
 */
async function getDocViewCount(docId: number): Promise<number> {
  const result = await dbAll(sql`
    SELECT COALESCE(SUM(view_count), 0) as total_views
    FROM shares
    WHERE doc_id = ${docId}
  `);
  return (result[0]?.total_views as number) || 0;
}

/**
 * 批量获取文档访问次数（解决 N+1 查询问题）
 */
async function getDocViewCountsBatch(docIds: number[]): Promise<Map<number, number>> {
  if (docIds.length === 0) return new Map();

  const results = await dbAll(sql`
    SELECT doc_id, COALESCE(SUM(view_count), 0) as total_views
    FROM shares
    WHERE doc_id IN (${sql.join(docIds.map(id => sql`${id}`), sql`, `)})
    GROUP BY doc_id
  `);

  const map = new Map<number, number>();
  for (const row of results as Array<{ doc_id: number; total_views: number }>) {
    map.set(row.doc_id, row.total_views);
  }
  return map;
}

// 全文搜索：搜索文档标题、摘要、标签和内容
export async function searchDocsFullText(
  actor: DocumentActor,
  query: string,
  options: FullTextSearchOptions = {},
  ipHash?: string
): Promise<{ results: SearchResult[]; total: number; hasMore: boolean; searchTime: number }> {
  const startTime = Date.now();
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return { results: [], total: 0, hasMore: false, searchTime: 0 };
  }

  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(options.pageSize) || DEFAULT_PAGE_SIZE)));
  const maxResults = Math.min(MAX_SEARCH_RESULTS, Math.max(1, options.maxResults || MAX_SEARCH_RESULTS));
  const sortBy = options.sortBy || "relevance";
  const sortOrder = options.sortOrder || "desc";
  const includeHighlights = options.includeHighlights !== false;

  const keywords = parseKeywords(normalizedQuery);
  const accessWhere = queryAccessWhere(actor);
  const candidateQuery = `%${normalizedQuery}%`;

  // 构建高级过滤条件
  const filterConditions: SQL<unknown>[] = [];

  // 状态过滤
  if (options.status) {
    filterConditions.push(eq(docs.status, options.status));
  }

  // 标签过滤
  if (options.tags?.length) {
    for (const tag of options.tags) {
      filterConditions.push(sql`${docs.tags} LIKE ${`%${tag}%`}`);
    }
  }

  // 日期范围过滤
  if (options.dateFrom) {
    filterConditions.push(sql`${docs.updatedAt} >= ${options.dateFrom}`);
  }
  if (options.dateTo) {
    filterConditions.push(sql`${docs.updatedAt} <= ${options.dateTo}`);
  }

  // 第一步：获取候选文档（通过标题、摘要、标签快速筛选）
  const candidates = await dbAll(
    db.select(selectFields())
      .from(docs)
      .leftJoin(users, eq(docs.ownerId, users.id))
      .where(and(
        accessWhere,
        sql`(title LIKE ${candidateQuery} OR summary LIKE ${candidateQuery} OR tags LIKE ${candidateQuery})`,
        ...filterConditions
      ))
      .limit(maxResults * 2) // 获取更多候选以确保相关性排序
  );

  if (candidates.length === 0) {
    const searchTime = Date.now() - startTime;
    // 异步记录搜索历史
    recordSearchHistory(actor.id, normalizedQuery, "fulltext", 0, searchTime, ipHash).catch(() => {});
    return { results: [], total: 0, hasMore: false, searchTime };
  }

  // 第二步：批量获取访问次数（优化 N+1 查询）
  const candidateIds = candidates.map(c => c.id);
  const viewCountMap = await getDocViewCountsBatch(candidateIds);

  // 第三步：批量解密并搜索内容，计算相关性分数
  interface CandidateResult extends SearchResult {
    relevanceScore: number;
  }
  const matchedResults: CandidateResult[] = [];

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

        // 计算相关性分数
        const relevanceScore = calculateRelevanceScore(
          candidate.title || "",
          candidate.summary || null,
          candidate.tags || "",
          contentText,
          keywords
        );

        // 从批量查询结果中获取访问次数
        const viewCount = viewCountMap.get(candidate.id) || 0;

        matchedResults.push({
          id: candidate.id,
          docUid: candidate.docUid,
          title: candidate.title || "未命名文档",
          summary: candidate.summary || undefined,
          snippet: getSnippet(contentText, normalizedQuery),
          tags,
          updatedAt: candidate.updatedAt,
          createdAt: candidate.createdAt,
          viewCount,
          relevanceScore,
          titleHighlighted: includeHighlights ? highlightText(candidate.title || "", keywords) : undefined,
          snippetHighlighted: includeHighlights ? highlightText(getSnippet(contentText, normalizedQuery, 150), keywords) : undefined,
        });

        // 达到最大结果数时停止
        if (matchedResults.length >= maxResults * 2) break;
      }
    } catch (error) {
      console.warn(`解密文档 ${candidate.id} 失败:`, error);
    }
  }

  // 第四步：排序
  matchedResults.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "relevance":
        comparison = (b.relevanceScore || 0) - (a.relevanceScore || 0);
        break;
      case "updatedAt":
        comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        break;
      case "createdAt":
        comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        break;
      case "viewCount":
        comparison = (b.viewCount || 0) - (a.viewCount || 0);
        break;
    }
    return sortOrder === "asc" ? -comparison : comparison;
  });

  // 第五步：分页
  const total = matchedResults.length;
  const offset = (page - 1) * pageSize;
  const pagedResults = matchedResults.slice(offset, offset + pageSize);

  const searchTime = Date.now() - startTime;

  // 异步记录搜索历史
  recordSearchHistory(actor.id, normalizedQuery, "fulltext", total, searchTime, ipHash).catch(() => {});

  return {
    results: pagedResults,
    total,
    hasMore: offset + pagedResults.length < total,
    searchTime
  };
}

// 快速搜索：仅搜索标题、摘要、标签（不解密内容）
export async function searchDocsQuick(
  actor: DocumentActor,
  query: string,
  options: FullTextSearchOptions = {},
  ipHash?: string
): Promise<{ results: SearchResult[]; total: number; hasMore: boolean; searchTime: number }> {
  const startTime = Date.now();
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return { results: [], total: 0, hasMore: false, searchTime: 0 };
  }

  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(options.pageSize) || DEFAULT_PAGE_SIZE)));
  const maxResults = Math.min(MAX_SEARCH_RESULTS, Math.max(1, options.maxResults || MAX_SEARCH_RESULTS));
  const sortBy = options.sortBy || "updatedAt";
  const sortOrder = options.sortOrder || "desc";
  const includeHighlights = options.includeHighlights !== false;

  const keywords = parseKeywords(normalizedQuery);
  const accessWhere = queryAccessWhere(actor);
  const candidateQuery = `%${normalizedQuery}%`;

  // 直接查询匹配标题、摘要、标签的文档
  let orderByClause;
  switch (sortBy) {
    case "createdAt":
      orderByClause = sortOrder === "asc" ? sql`${docs.createdAt} ASC` : sql`${docs.createdAt} DESC`;
      break;
    case "viewCount":
      // 需要 JOIN shares 表
      orderByClause = sortOrder === "asc"
        ? sql`COALESCE((SELECT SUM(view_count) FROM shares WHERE shares.doc_id = docs.id), 0) ASC`
        : sql`COALESCE((SELECT SUM(view_count) FROM shares WHERE shares.doc_id = docs.id), 0) DESC`;
      break;
    case "relevance":
    default:
      // 对于快速搜索，相关性 = 标题优先
      orderByClause = sortOrder === "asc"
        ? sql`CASE WHEN title LIKE ${candidateQuery} THEN 0 ELSE 1 END, ${docs.updatedAt} DESC`
        : sql`CASE WHEN title LIKE ${candidateQuery} THEN 0 ELSE 1 END, ${docs.updatedAt} DESC`;
  }

  const candidates = await dbAll(sql`
    SELECT
      docs.id,
      docs.doc_uid,
      docs.title,
      docs.summary,
      docs.tags,
      docs.updated_at,
      docs.created_at,
      COALESCE((SELECT SUM(view_count) FROM shares WHERE shares.doc_id = docs.id), 0) as view_count
    FROM docs
    WHERE docs.deleted_at IS NULL
      AND docs.owner_id = ${actor.id}
      AND (docs.title LIKE ${candidateQuery} OR docs.summary LIKE ${candidateQuery} OR docs.tags LIKE ${candidateQuery})
    ORDER BY ${orderByClause}
    LIMIT ${maxResults}
  `);

  const results: SearchResult[] = candidates.map(candidate => {
    let tags: string[] | undefined;
    try {
      tags = JSON.parse((candidate.tags as string) || "[]");
    } catch {
      tags = [];
    }

    const snippet = candidate.summary
      ? getSnippet(candidate.summary as string, normalizedQuery, 200)
      : "";

    return {
      id: candidate.id as number,
      docUid: candidate.doc_uid as string,
      title: (candidate.title as string) || "未命名文档",
      summary: (candidate.summary as string) || undefined,
      snippet,
      tags,
      updatedAt: new Date(candidate.updated_at as string),
      createdAt: new Date(candidate.created_at as string),
      viewCount: candidate.view_count as number,
      titleHighlighted: includeHighlights ? highlightText(candidate.title as string || "", keywords) : undefined,
      snippetHighlighted: includeHighlights ? highlightText(snippet, keywords) : undefined,
    };
  });

  const total = results.length;
  const offset = (page - 1) * pageSize;
  const pagedResults = results.slice(offset, offset + pageSize);

  const searchTime = Date.now() - startTime;

  // 异步记录搜索历史
  recordSearchHistory(actor.id, normalizedQuery, "quick", total, searchTime, ipHash).catch(() => {});

  return {
    results: pagedResults,
    total,
    hasMore: offset + pagedResults.length < total,
    searchTime
  };
}

// 带建议的搜索（组合接口）
export async function searchWithSuggestions(
  actor: DocumentActor,
  query: string,
  options: FullTextSearchOptions = {},
  ipHash?: string
): Promise<{
  results: SearchResult[];
  total: number;
  hasMore: boolean;
  searchTime: number;
  suggestions: SearchSuggestion[];
  history: SearchHistoryItem[];
}> {
  const [searchResult, suggestions, history] = await Promise.all([
    searchDocsFullText(actor, query, { ...options, pageSize: options.pageSize || 20 }),
    query.trim() ? getSearchSuggestions(actor.id, query, 5) : Promise.resolve([]),
    query.trim() ? Promise.resolve([]) : getSearchHistory(actor.id, 10)
  ]);

  return {
    ...searchResult,
    suggestions,
    history
  };
}
