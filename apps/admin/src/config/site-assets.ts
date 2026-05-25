import type { SiteConfigView } from "../api/settings";

export const bundledLogoUrl = "/site-assets/chendoc-logo.png";
export const bundledWallpaperUrl = "/site-assets/desktop-bg.webp";
export const defaultRemoteLogoUrl = "https://cc.jy920.asia/chendoc-health/ChatGPT%20Image%202026%E5%B9%B44%E6%9C%8829%E6%97%A5%2019_47_58.png";
export const defaultRemoteWallpaperUrl = "https://cc.jy920.asia/chendoc-health/4096x2714.jpg";

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

export function preloadImageAsset(url: string): Promise<boolean> {
  if (!url || typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    image.decoding = "async";
    image.onload = () => done(true);
    image.onerror = () => done(false);
    image.src = url;

    if (image.complete && image.naturalWidth > 0) done(true);
  });
}
