import { BoundedMemoryCache } from "../shares/bounded-memory-cache.js";

export interface CachedShareHtml {
  html: string;
  contentHash: string;
  etag: string;
  lastModified: Date;
  cachedAt: number;
}

const SHARE_HTML_CACHE_MAX_SIZE = 500;
const SHARE_HTML_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const SHARE_HTML_CACHE_TTL_MS = 2 * 60 * 1000;
const shareHtmlCache = new BoundedMemoryCache<string, CachedShareHtml>({
  maxEntries: SHARE_HTML_CACHE_MAX_SIZE,
  maxBytes: SHARE_HTML_CACHE_MAX_BYTES,
  ttlMs: SHARE_HTML_CACHE_TTL_MS,
  sizeOf: (cached) => 512
    + cached.html.length * 2
    + cached.contentHash.length * 2
    + cached.etag.length * 2
});

export function canonicalShareCacheKey(shareKey: string | number) {
  const value = String(shareKey).trim();
  if (/^\d+$/.test(value)) {
    try {
      return BigInt(value).toString();
    } catch {
      return value;
    }
  }
  return value.toLowerCase();
}

export function getCachedShareHtml(shareKey: string | number, accessToken?: string): CachedShareHtml | null {
  if (accessToken) return null;
  const cacheKey = canonicalShareCacheKey(shareKey);
  return shareHtmlCache.get(cacheKey);
}

export function setCachedShareHtml(shareKey: string | number, html: CachedShareHtml) {
  shareHtmlCache.set(canonicalShareCacheKey(shareKey), html);
}

export function invalidateShareHtmlCache(shareKey?: string | number) {
  if (shareKey !== undefined && shareKey !== null && String(shareKey).trim() !== "") {
    shareHtmlCache.delete(canonicalShareCacheKey(shareKey));
    return;
  }
  shareHtmlCache.clear();
}

export function checkShareHtmlCache(
  shareKey: string | number,
  accessToken?: string,
  ifNoneMatch?: string,
  ifModifiedSince?: Date,
): { cached: CachedShareHtml; hit304: boolean } | null {
  const cached = getCachedShareHtml(shareKey, accessToken);
  if (!cached) return null;
  if (ifNoneMatch) {
    const clientEtag = ifNoneMatch.replace(/^W\//, "").replace(/^["']|["']$/g, "");
    if (clientEtag === cached.etag.replace(/^"|"$/g, "")) return { cached, hit304: true };
  }
  if (ifModifiedSince
    && Math.floor(cached.lastModified.getTime() / 1000) <= Math.floor(ifModifiedSince.getTime() / 1000)) {
    return { cached, hit304: true };
  }
  return { cached, hit304: false };
}
