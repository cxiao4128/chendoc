export interface ChendocRuntimeConfig {
  apiBaseUrl?: string;
  publicBaseUrl?: string;
}

declare global {
  interface Window {
    __CHENDOC_RUNTIME_CONFIG__?: ChendocRuntimeConfig;
  }
}

const PLACEHOLDER_PREFIX = "__CHENDOC_";

function runtimeConfig() {
  return typeof window === "undefined" ? {} : window.__CHENDOC_RUNTIME_CONFIG__ ?? {};
}

function normalizeOrigin(value: string | undefined, label: string) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (raw.startsWith(PLACEHOLDER_PREFIX)) {
    throw new Error(`${label}尚未配置，请先修改 chendoc-runtime-config.js`);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label}必须是完整的 http(s) 地址`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label}只允许 http(s) 地址`);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error(`${label}只能填写站点来源，例如 https://api.example.com`);
  }
  if (typeof window !== "undefined" && window.location.protocol === "https:" && url.protocol !== "https:") {
    throw new Error(`${label}必须使用 HTTPS`);
  }
  return url.origin;
}

export function apiBaseUrl() {
  const config = runtimeConfig();
  return normalizeOrigin(
    config.apiBaseUrl || import.meta.env.VITE_CHENDOC_API_BASE_URL,
    "后端 API 地址",
  );
}

export function publicBaseUrl() {
  const config = runtimeConfig();
  return normalizeOrigin(
    config.publicBaseUrl || import.meta.env.VITE_CHENDOC_PUBLIC_BASE_URL,
    "公开页面地址",
  ) || apiBaseUrl() || (typeof window === "undefined" ? "" : window.location.origin);
}

function joinOrigin(origin: string, path: string) {
  if (!path.startsWith("/")) throw new Error(`后端路径必须以 / 开头：${path}`);
  return origin ? `${origin}${path}` : path;
}

export function backendUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    const expectedOrigin = apiBaseUrl() || (typeof window === "undefined" ? "" : window.location.origin);
    if (!expectedOrigin || url.origin !== expectedOrigin || !url.pathname.startsWith("/api/")) {
      throw new Error("拒绝向配置后端之外的地址发送 API 凭据");
    }
    return url.href;
  }
  if (!path.startsWith("/api/")) throw new Error(`API 路径无效：${path}`);
  return joinOrigin(apiBaseUrl(), path);
}

export function publicUrl(path: string) {
  return joinOrigin(publicBaseUrl(), path);
}

export function backendFetch(path: string, options: RequestInit = {}) {
  return fetch(backendUrl(path), {
    ...options,
    credentials: "include",
  });
}
