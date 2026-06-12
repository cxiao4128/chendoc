import type { SiteConfigView } from "../api/settings";

export const bundledLogoUrl = "/site-assets/chendoc-logo.png";
export const bundledWallpaperUrl = "/site-assets/desktop-bg.png";
export const defaultRemoteLogoUrl = "";
export const defaultRemoteWallpaperUrl = "";

function resolveRemoteAsset(enabled: boolean, value: string, bundledUrl: string) {
  const trimmed = value.trim();
  if (!enabled || !trimmed) return bundledUrl;
  return trimmed;
}

export function withBundledSiteAssets(config: SiteConfigView): SiteConfigView {
  return {
    ...config,
    logoUrl: resolveRemoteAsset(config.preferRemoteLogo, config.logoUrl, bundledLogoUrl),
    authWallpaperUrl: resolveRemoteAsset(config.preferRemoteWallpaper, config.authWallpaperUrl, bundledWallpaperUrl)
  };
}

export function preloadImageAsset(url: string, timeoutMs = 2500): Promise<boolean> {
  if (!url || typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(ok);
    };
    const timeout = window.setTimeout(() => done(false), timeoutMs);

    image.decoding = "async";
    if ("fetchPriority" in image) {
      (image as HTMLImageElement & { fetchPriority: string }).fetchPriority = "high";
    }
    image.onload = () => done(true);
    image.onerror = () => done(false);
    image.src = url;

    if (image.complete && image.naturalWidth > 0) done(true);
  });
}
