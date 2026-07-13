export interface SiteBrand {
  siteName: string;
  logoUrl: string;
  shareFooterText: string;
}

type CachedSiteBrand = SiteBrand & { cachedAt: number };

const SITE_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedSiteBrand: CachedSiteBrand | null = null;

export async function getCachedSiteBrand(load: () => Promise<SiteBrand>): Promise<SiteBrand> {
  const currentTime = Date.now();
  if (cachedSiteBrand && currentTime - cachedSiteBrand.cachedAt < SITE_CONFIG_CACHE_TTL_MS) {
    return cachedSiteBrand;
  }

  const loaded = await load();
  cachedSiteBrand = { ...loaded, cachedAt: currentTime };
  return cachedSiteBrand;
}

export function invalidateSiteBrandCache() {
  cachedSiteBrand = null;
}
