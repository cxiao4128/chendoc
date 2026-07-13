// ChenDoc v2.10.0 - 文档全文搜索服务
// 支持对文档内容进行全文搜索，包含高亮、排序、建议和历史记录

import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { createHash } from "crypto";
import {
  accessLogs,
  docs,
  searchHistory,
  shares,
  users,
  insertSearchHistory,
  getSearchHistory as getSearchHistoryFromRepo,
  getSearchHistoryById,
  deleteSearchHistory,
  clearUserSearchHistory,
  getSearchSuggestionsFromHistory,
  getDocSuggestions,
  getDocViewCounts,
} from "./search.repo.js";
import { db, dbAll } from "../../db/client.js";
export { accessLogs, docs, searchHistory, shares, users };
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

function computeHash(str: string): string {
  return createHash("md5").update(str.toLowerCase().trim()).digest("hex");
}

function textContainsQuery(text: string, query: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(query.toLowerCase());
}

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

export function highlightText(
  text: string,
  keywords: string[],
  maxLength = 200
): HighlightedPart[] {
  if (!text || !keywords.length) {
    return [{ text, highlighted: false }];
  }

  const validKeywords = keywords.filter(k => k.trim().length > 0);
  if (!validKeywords.length) {
    return [{ text, highlighted: false }];
  }

  const escapedKeywords = validKeywords.map(k =>
    k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const regex = new RegExp(`(${escapedKeywords.join("|")})`, "gi");

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

  matches.sort((a, b) => a.start - b.start);

  const firstMatch = matches[0];
  const lastMatch = matches[matches.length - 1];
  const windowStart = Math.max(0, firstMatch.start - 30);
  const windowEnd = Math.min(text.length, lastMatch.end + (maxLength - (lastMatch.end - firstMatch.start)) - 50);

  const windowText = text.slice(windowStart, windowEnd);
  const prefix = windowStart > 0 ? "..." : "";
  const suffix = windowEnd < text.length ? "..." : "";

  const windowRegex = new RegExp(`(${escapedKeywords.join("|")})`, "gi");
  const parts: HighlightedPart[] = [];
  let lastIndex = 0;
  let matchInWindow;

  while ((matchInWindow = windowRegex.exec(windowText)) !== null) {
    if (matchInWindow.index > lastIndex) {
      parts.push({ text: windowText.slice(lastIndex, matchInWindow.index), highlighted: false });
    }
    parts.push({ text: matchInWindow[0], highlighted: true });
    lastIndex = matchInWindow.index + matchInWindow[0].length;
  }

  if (lastIndex < windowText.length) {
    parts.push({ text: windowText.slice(lastIndex), highlighted: false });
  }

  if (prefix) parts.unshift({ text: prefix, highlighted: false });
  if (suffix) parts.push({ text: suffix, highlighted: false });

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

export function parseKeywords(query: string): string[] {
  return query.trim().split(/\s+/).filter(k => k.length >= 1);
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
  viewCount?: number;
  relevanceScore?: number;
}

export interface FullTextSearchOptions {
  page?: number;
  pageSize?: number;
  maxResults?: number;
  sortBy?: "relevance" | "updatedAt" | "createdAt" | "viewCount";
  sortOrder?: "asc" | "desc";
  includeHighlights?: boolean;
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

// ============================================================
// 搜索历史记录
// ============================================================

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
    await insertSearchHistory({
      userId,
      query,
      queryHash,
      searchMode,
      resultCount,
      searchTime,
      ipHash: ipHash ?? null,
      createdAt: now
    });
  } catch {
    console.warn("Failed to record search history");
  }
}

export async function getSearchHistory(
  userId: number,
  limit: number = MAX_HISTORY_ITEMS
): Promise<SearchHistoryItem[]> {
  const results = await getSearchHistoryFromRepo(userId, Math.min(limit, MAX_HISTORY_ITEMS));
  return results.map(r => ({
    id: r.id,
    query: r.query,
    searchMode: r.searchMode,
    resultCount: r.resultCount,
    searchTime: r.searchTime,
    createdAt: r.createdAt
  }));
}

export async function deleteSearchHistoryItem(
  userId: number,
  query: string
): Promise<void> {
  const queryHash = computeHash(query);
  await deleteSearchHistory(userId, queryHash);
}

export async function clearSearchHistory(userId: number): Promise<void> {
  await clearUserSearchHistory(userId);
}

export async function getSearchHistoryItemById(
  historyId: number,
  userId: number
): Promise<SearchHistoryItem | null> {
  const results = await getSearchHistoryById(historyId, userId);
  if (results.length === 0) return null;
  const r = results[0];
  return {
    id: r.id,
    query: r.query,
    searchMode: r.searchMode,
    resultCount: r.resultCount,
    searchTime: r.searchTime,
    createdAt: r.createdAt
  };
}

// ============================================================
// 搜索建议/自动补全
// ============================================================

export async function getSearchSuggestions(
  actor: DocumentActor,
  prefix: string,
  limit: number = MAX_SUGGESTIONS
): Promise<SearchSuggestion[]> {
  if (!prefix || prefix.trim().length < 1) return [];

  const normalizedPrefix = prefix.toLowerCase().trim();
  const historyResults = await getSearchSuggestionsFromHistory(actor.id, normalizedPrefix, limit);

  if (historyResults.length >= limit) {
    return historyResults.slice(0, limit).map(r => ({
      keyword: r.query,
      count: Number(r.count)
    }));
  }

  const docResults = await getDocSuggestions(actor, normalizedPrefix, limit * 2);
  const seen = new Set<string>();
  const suggestions: SearchSuggestion[] = [];

  for (const r of historyResults) {
    const keyword = r.query;
    if (!seen.has(keyword.toLowerCase())) {
      seen.add(keyword.toLowerCase());
      suggestions.push({ keyword, count: Number(r.count) });
    }
  }

  for (const r of docResults) {
    const keyword = (r.suggestion as string).trim();
    if (keyword && !seen.has(keyword.toLowerCase())) {
      seen.add(keyword.toLowerCase());
      suggestions.push({ keyword, count: 1 });
      if (suggestions.length >= limit) break;
    }
  }

  return suggestions.slice(0, limit);
}

// ============================================================
// 全文搜索
// ============================================================

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
    const titleMatches = (lowerTitle.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    score += titleMatches * 10;
    const summaryMatches = (lowerSummary.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    score += summaryMatches * 5;
    const tagMatches = (lowerTags.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    score += tagMatches * 3;
    const contentMatches = (lowerContent.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    score += Math.min(contentMatches, 10) * 1;
  }

  return score;
}

async function getDocViewCountsMap(docIds: number[]): Promise<Map<number, number>> {
  if (docIds.length === 0) return new Map();
  const results = await getDocViewCounts(docIds);
  const map = new Map<number, number>();
  for (const row of results) {
    map.set(row.docId, Number(row.totalViews));
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
  const filterConditions: SQL<unknown>[] = [];
  if (options.status) {
    filterConditions.push(eq(docs.status, options.status));
  }
  if (options.tags?.length) {
    for (const tag of options.tags) {
      filterConditions.push(sql`${docs.tags} LIKE ${`%${tag}%`}`);
    }
  }
  if (options.dateFrom) {
    filterConditions.push(sql`${docs.updatedAt} >= ${options.dateFrom}`);
  }
  if (options.dateTo) {
    filterConditions.push(sql`${docs.updatedAt} <= ${options.dateTo}`);
  }

  const scanLimit = Math.min(MAX_SEARCH_RESULTS * 2, Math.max(maxResults * 2, page * pageSize * 2));
  const candidates = await dbAll(
    db.select({
      id: docs.id,
      docUid: docs.docUid,
      title: docs.title,
      summary: docs.summary,
      contentJson: docs.contentJson,
      contentJsonCiphertext: docs.contentJsonCiphertext,
      contentJsonIv: docs.contentJsonIv,
      contentJsonTag: docs.contentJsonTag,
      contentJsonKeyVersion: docs.contentJsonKeyVersion,
      contentHtml: docs.contentHtml,
      contentHtmlCiphertext: docs.contentHtmlCiphertext,
      contentHtmlIv: docs.contentHtmlIv,
      contentHtmlTag: docs.contentHtmlTag,
      contentHtmlKeyVersion: docs.contentHtmlKeyVersion,
      tags: docs.tags,
      ownerId: docs.ownerId,
      updatedAt: docs.updatedAt,
      createdAt: docs.createdAt,
    })
      .from(docs)
      .leftJoin(users, eq(docs.ownerId, users.id))
      .where(and(
        accessWhere,
        ...filterConditions
      ))
      .orderBy(desc(docs.updatedAt))
      .limit(scanLimit)
  );

  if (candidates.length === 0) {
    const searchTime = Date.now() - startTime;
    recordSearchHistory(actor.id, normalizedQuery, "fulltext", 0, searchTime, ipHash).catch(() => {});
    return { results: [], total: 0, hasMore: false, searchTime };
  }

  const candidateIds = candidates.map(c => c.id);
  const viewCountMap = await getDocViewCountsMap(candidateIds);

  interface CandidateResult extends SearchResult {
    relevanceScore: number;
  }
  const matchedResults: CandidateResult[] = [];

  for (const candidate of candidates) {
    try {
      const decrypted = decryptDocumentRecord({
        contentHtmlCiphertext: candidate.contentHtmlCiphertext,
        contentHtmlIv: candidate.contentHtmlIv,
        contentHtmlTag: candidate.contentHtmlTag,
        contentHtmlKeyVersion: candidate.contentHtmlKeyVersion,
        contentJson: candidate.contentJson,
        contentJsonCiphertext: candidate.contentJsonCiphertext,
        contentJsonIv: candidate.contentJsonIv,
        contentJsonTag: candidate.contentJsonTag,
        contentJsonKeyVersion: candidate.contentJsonKeyVersion,
      } as any);

      const contentText = stripHtml(decrypted.contentHtml || "");

      let tags: string[] | undefined;
      try {
        tags = JSON.parse(candidate.tags || "[]");
      } catch {
        tags = [];
      }

      const titleText = candidate.title || "";
      const summaryText = candidate.summary || "";
      const tagText = Array.isArray(tags) ? tags.join(" ") : candidate.tags || "";
      const contentMatched = textContainsQuery(contentText, normalizedQuery);
      const metadataMatched =
        textContainsQuery(titleText, normalizedQuery)
        || textContainsQuery(summaryText, normalizedQuery)
        || textContainsQuery(tagText, normalizedQuery);

      if (contentMatched || metadataMatched) {
        const relevanceScore = calculateRelevanceScore(
          titleText,
          summaryText || null,
          candidate.tags || "",
          contentText,
          keywords
        );

        const viewCount = viewCountMap.get(candidate.id) || 0;
        const snippetSource = contentMatched ? contentText : summaryText || titleText || tagText;

        matchedResults.push({
          id: candidate.id,
          docUid: candidate.docUid,
          title: titleText || "未命名文档",
          summary: summaryText || undefined,
          snippet: getSnippet(snippetSource, normalizedQuery),
          tags,
          updatedAt: candidate.updatedAt,
          createdAt: candidate.createdAt,
          viewCount,
          relevanceScore,
          titleHighlighted: includeHighlights ? highlightText(titleText, keywords) : undefined,
          snippetHighlighted: includeHighlights ? highlightText(getSnippet(snippetSource, normalizedQuery, 150), keywords) : undefined,
        });

        if (matchedResults.length >= maxResults * 2) break;
      }
    } catch (error) {
      console.warn(`解密文档 ${candidate.id} 失败:`, error);
    }
  }

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

  const total = matchedResults.length;
  const offset = (page - 1) * pageSize;
  const pagedResults = matchedResults.slice(offset, offset + pageSize);

  const searchTime = Date.now() - startTime;
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
  const candidateQuery = `%${normalizedQuery}%`;

  // 按 ownerId 过滤
  const ownerFilter = actor.isSuperAdmin
    ? sql`1=1`
    : sql`${docs.ownerId} = ${actor.id}`;

  let orderByClause;
  switch (sortBy) {
    case "createdAt":
      orderByClause = sortOrder === "asc" ? sql`${docs.createdAt} ASC` : sql`${docs.createdAt} DESC`;
      break;
    case "viewCount":
      orderByClause = sortOrder === "asc"
        ? sql`COALESCE((SELECT SUM(${shares.viewCount}) FROM ${shares} WHERE ${shares.docId} = ${docs.id}), 0) ASC`
        : sql`COALESCE((SELECT SUM(${shares.viewCount}) FROM ${shares} WHERE ${shares.docId} = ${docs.id}), 0) DESC`;
      break;
    default:
      orderByClause = sortOrder === "asc"
        ? sql`CASE WHEN ${docs.title} LIKE ${candidateQuery} THEN 0 ELSE 1 END, ${docs.updatedAt} DESC`
        : sql`CASE WHEN ${docs.title} LIKE ${candidateQuery} THEN 0 ELSE 1 END, ${docs.updatedAt} DESC`;
  }

  const candidates = await dbAll(
    db.select({
      id: docs.id,
      docUid: docs.docUid,
      title: docs.title,
      summary: docs.summary,
      tags: docs.tags,
      updatedAt: docs.updatedAt,
      createdAt: docs.createdAt,
      viewCount: sql<number>`COALESCE((SELECT SUM(${shares.viewCount}) FROM ${shares} WHERE ${shares.docId} = ${docs.id}), 0)`.as("viewCount"),
    })
      .from(docs)
      .leftJoin(shares, eq(shares.docId, docs.id))
      .where(and(
        isNull(docs.deletedAt),
        ownerFilter,
        sql`(${docs.title} LIKE ${candidateQuery} OR ${docs.summary} LIKE ${candidateQuery} OR ${docs.tags} LIKE ${candidateQuery})`
      ))
      .orderBy(orderByClause)
      .limit(maxResults)
  );

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
      id: candidate.id,
      docUid: candidate.docUid,
      title: (candidate.title as string) || "未命名文档",
      summary: (candidate.summary as string) || undefined,
      snippet,
      tags,
      updatedAt: candidate.updatedAt as unknown as Date,
      createdAt: candidate.createdAt as unknown as Date,
      viewCount: Number(candidate.viewCount) || 0,
      titleHighlighted: includeHighlights ? highlightText((candidate.title as string) || "", keywords) : undefined,
      snippetHighlighted: includeHighlights ? highlightText(snippet, keywords) : undefined,
    };
  });

  const total = results.length;
  const offset = (page - 1) * pageSize;
  const pagedResults = results.slice(offset, offset + pageSize);

  const searchTime = Date.now() - startTime;
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
  _ipHash?: string
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
    query.trim() ? getSearchSuggestions(actor, query, 5) : Promise.resolve([]),
    query.trim() ? Promise.resolve([]) : getSearchHistory(actor.id, 10)
  ]);

  return {
    ...searchResult,
    suggestions,
    history
  };
}
