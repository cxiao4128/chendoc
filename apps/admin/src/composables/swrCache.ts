import type { CacheEntry } from "./swrTypes";

const globalCache = new Map<string, CacheEntry<unknown>>();
const cacheTimestamps = new Map<string, number>();

export const DEFAULT_TTL = 2 * 60 * 1000;
export const DEFAULT_DEDUP_INTERVAL = 2 * 1000;
export const DEFAULT_MAX_RETRIES = 3;

export function getCache<T>(key: string): CacheEntry<T> | null {
  const entry = globalCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const ttl = cacheTimestamps.get(`_ttl_${key}`) || DEFAULT_TTL;
  if (Date.now() - entry.timestamp > ttl) {
    deleteCache(key);
    return null;
  }
  return entry;
}

export function setCache<T>(key: string, data: T, ttl: number, error?: Error): void {
  globalCache.set(key, { data, timestamp: Date.now(), error });
  cacheTimestamps.set(key, Date.now());
  cacheTimestamps.set(`_ttl_${key}`, ttl);
}

export function deleteCache(key: string): void {
  globalCache.delete(key);
  cacheTimestamps.delete(key);
  cacheTimestamps.delete(`_ttl_${key}`);
}

export function clearAllSWRCache(): void {
  globalCache.clear();
  cacheTimestamps.clear();
}

export function getSWRCacheStats(): { size: number; keys: string[] } {
  return {
    size: globalCache.size,
    keys: Array.from(globalCache.keys()),
  };
}
