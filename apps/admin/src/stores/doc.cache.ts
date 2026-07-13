import type { DocDetail, DocSummary } from "@/services/api";

const DETAIL_CACHE_TTL_MS = 2 * 60 * 1000;
const LIST_CACHE_TTL_MS = 60 * 1000;
const MAX_DETAIL_CACHE_SIZE = 200;
const MAX_LIST_CACHE_SIZE = 100;

interface DetailCacheEntry {
  doc: DocDetail;
  expiresAt: number;
}

export interface ListCacheEntry {
  docs: DocSummary[];
  pagination: { page: number; hasMore: boolean };
  expiresAt: number;
}

const detailCache = new Map<string, DetailCacheEntry>();
const listCache = new Map<string, ListCacheEntry>();

function evictDetailCache(): void {
  if (detailCache.size < MAX_DETAIL_CACHE_SIZE) return;
  const entries = Array.from(detailCache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const removeCount = Math.ceil(entries.length * 0.3);
  for (let i = 0; i < removeCount; i++) {
    detailCache.delete(entries[i][0]);
  }
}

function evictListCache(): void {
  if (listCache.size < MAX_LIST_CACHE_SIZE) return;
  const entries = Array.from(listCache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const removeCount = Math.ceil(entries.length * 0.3);
  for (let i = 0; i < removeCount; i++) {
    listCache.delete(entries[i][0]);
  }
}

export function setDetailCache(doc: DocDetail): void {
  evictDetailCache();
  detailCache.set(doc.docUid, {
    doc,
    expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
  });
}

export function getDetailCache(docUid: string): DocDetail | null {
  const cached = detailCache.get(docUid);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    detailCache.delete(docUid);
    return null;
  }
  return cached.doc;
}

export function setListCache(key: string, docs: DocSummary[], pagination: { page: number; hasMore: boolean }): void {
  evictListCache();
  listCache.set(key, {
    docs,
    pagination,
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
  });
}

export function getListCache(key: string): ListCacheEntry | null {
  const cached = listCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    listCache.delete(key);
    return null;
  }
  return cached;
}

export function pruneExpiredCache(): void {
  const now = Date.now();
  for (const [docUid, cached] of detailCache) {
    if (cached.expiresAt <= now) detailCache.delete(docUid);
  }
  for (const [key, cached] of listCache) {
    if (cached.expiresAt <= now) listCache.delete(key);
  }
}

export function invalidateDetailCache(docUid: string): void {
  detailCache.delete(docUid);
}

export function invalidateListCache(): void {
  listCache.clear();
}

export function clearDocStoreCache(): void {
  detailCache.clear();
  listCache.clear();
}
