/**
 * search.repo.ts
 *
 * 搜索模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑、权限检查、加密、Schema 校验。
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, dbAll, dbRun } from "../../db/client.js";
import { accessLogs, docs, searchHistory, shares, users } from "../../db/schema.js";
import type { DocumentActor } from "./documentAccess.js";
export { accessLogs, docs, searchHistory, shares, users };

export async function insertSearchHistory(values: {
  userId: number;
  query: string;
  queryHash: string;
  searchMode: string;
  resultCount: number;
  searchTime: number;
  ipHash: string | null;
  createdAt: Date;
}) {
  await dbRun(db.insert(searchHistory).values(values));
}

export async function updateSearchHistory(userId: number, queryHash: string, patch: {
  resultCount: number;
  searchTime: number;
  ipHash?: string | null;
  createdAt: Date;
}) {
  await dbRun(db.update(searchHistory).set(patch).where(sql`${searchHistory.userId} = ${userId} AND ${searchHistory.queryHash} = ${queryHash}`));
}

export async function getSearchHistory(userId: number, limit: number) {
  return dbAll(
    db.select({
      id: searchHistory.id,
      query: searchHistory.query,
      searchMode: searchHistory.searchMode,
      resultCount: searchHistory.resultCount,
      searchTime: searchHistory.searchTime,
      createdAt: searchHistory.createdAt,
    })
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.createdAt))
      .limit(limit)
  );
}

export async function getSearchHistoryById(historyId: number, userId: number) {
  return dbAll(
    db.select({
      id: searchHistory.id,
      query: searchHistory.query,
      searchMode: searchHistory.searchMode,
      resultCount: searchHistory.resultCount,
      searchTime: searchHistory.searchTime,
      createdAt: searchHistory.createdAt,
    })
      .from(searchHistory)
      .where(and(eq(searchHistory.id, historyId), eq(searchHistory.userId, userId)))
      .limit(1)
  );
}

export async function deleteSearchHistory(userId: number, queryHash: string) {
  await dbRun(db.delete(searchHistory).where(sql`${searchHistory.userId} = ${userId} AND ${searchHistory.queryHash} = ${queryHash}`));
}

export async function clearUserSearchHistory(userId: number) {
  await dbRun(db.delete(searchHistory).where(eq(searchHistory.userId, userId)));
}

export async function getSearchSuggestionsFromHistory(userId: number, prefix: string, limit: number) {
  return dbAll(
    db.select({
      query: searchHistory.query,
      count: sql<number>`count(*)`.as("count"),
    })
      .from(searchHistory)
      .where(and(eq(searchHistory.userId, userId), sql`LOWER(${searchHistory.query}) LIKE ${prefix.toLowerCase() + '%'}`))
      .groupBy(searchHistory.query)
      .orderBy(sql`count(*) DESC, MAX(${searchHistory.createdAt}) DESC`)
      .limit(limit)
  );
}

export async function getDocSuggestions(actor: DocumentActor, prefix: string, limit: number) {
  const normalizedPrefix = prefix.toLowerCase();
  const accessWhere = actor.isSuperAdmin ? sql`1 = 1` : eq(docs.ownerId, actor.id);
  return dbAll(
    db.select({ suggestion: docs.title })
      .from(docs)
      .where(and(accessWhere, isNull(docs.deletedAt), sql`LOWER(${docs.title}) LIKE ${normalizedPrefix + '%'}`))
      .limit(limit)
  );
}

export async function getTagSuggestions(prefix: string, limit: number) {
  return dbAll(
    db.select({ suggestion: sql<string>`json_each.value` })
      .from(docs)
      .where(and(isNull(docs.deletedAt), sql`json_each(tags) LIKE ${prefix.toLowerCase() + '%'}`))
      .limit(limit)
  );
}

export async function getDocViewCounts(docIds: number[]) {
  if (docIds.length === 0) return new Map<number, number>();
  return dbAll(
    db.select({
      docId: shares.docId,
      totalViews: sql<number>`COALESCE(SUM(${shares.viewCount}), 0)`.as("totalViews"),
    })
      .from(shares)
      .where(sql`${shares.docId} IN (${sql.join(docIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(shares.docId)
  );
}

export async function getAccessLogStats(docId: number) {
  const result = await dbAll(
    db.select({
      count: sql<number>`count(*)`.as("count"),
    })
      .from(accessLogs)
      .where(eq(accessLogs.targetId, docId))
  );
  return result[0]?.count ?? 0;
}
