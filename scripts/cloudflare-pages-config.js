import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function isReservedExampleHostname(hostname) {
  const value = String(hostname || "").toLowerCase();
  return value.endsWith(".example")
    || value === "example.com"
    || value.endsWith(".example.com")
    || value === "example.net"
    || value.endsWith(".example.net")
    || value === "example.org"
    || value.endsWith(".example.org");
}

export function exactHttpsOrigin(value, name, example) {
  if (!value) throw new Error(`${name} is required, for example ${name}=${example}`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a complete HTTPS origin.`);
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== "/" && url.pathname !== "")
    || isReservedExampleHostname(url.hostname)
  ) {
    throw new Error(`${name} must be an HTTPS origin without path, query, hash, or credentials.`);
  }
  return url.origin;
}

export function parseConnectOrigins(value, name = "CHENDOC_CLOUDFLARE_CONNECT_ORIGINS") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => exactHttpsOrigin(item, name, "https://assets.w92.pw"));
}

export function containsServerSecretAssignment(content) {
  const source = String(content || "");
  const secretNames = [
    "DATABASE_URL",
    "CHENDOC_BACKUP_VERIFY_DATABASE_URL",
    "JWT_SECRET",
    "CONFIG_ENCRYPTION_KEY",
    "RSA_PRIVATE_KEY_ENCRYPTION_KEY",
    "CHENDOC_DOCUMENT_ENCRYPTION_KEY",
    "CHENDOC_BACKUP_ENCRYPTION_KEY",
    "DEFAULT_ADMIN_PASSWORD",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "CHENDOC_UPLOAD_SCAN_WEBHOOK",
    "CLOUDFLARE_API_TOKEN",
    "GITHUB_TOKEN",
    "GH_TOKEN",
  ].join("|");
  const assignment = new RegExp(
    `(?:["']?(?:${secretNames})["']?)\\s*[:=]\\s*(?:"[^"\\r\\n]+"|'[^'\\r\\n]+'|[^\\s,;}]+)`,
    "i",
  );
  return assignment.test(source)
    || /(?:mysql|mariadb|postgres(?:ql)?):\/\/[^:\s"'@]+:[^@\s"']+@/i.test(source)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source);
}

export function cloudflareHeaders(backendOrigin, extraConnectOrigins = []) {
  const connectSources = [
    "'self'",
    backendOrigin,
    "https://*.r2.cloudflarestorage.com",
    "https://api.github.com",
    "https://raw.githubusercontent.com",
    ...extraConnectOrigins,
  ];
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    `connect-src ${[...new Set(connectSources)].join(" ")}`,
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  return `/*
  Content-Security-Policy: ${csp}
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/index.html
  Cache-Control: no-store

/chendoc-runtime-config.js
  Cache-Control: no-store

/route-preloads.js
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/site-assets/*
  Cache-Control: public, max-age=3600, must-revalidate
`;
}

export function writeCloudflarePagesFiles({
  outputDir,
  backendOrigin,
  publicOrigin,
  extraConnectOrigins = [],
}) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "chendoc-runtime-config.js"), `window.__CHENDOC_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify({
    apiBaseUrl: backendOrigin,
    publicBaseUrl: publicOrigin,
  }, null, 2)});\n`);
  writeFileSync(path.join(outputDir, "_redirects"), "/* /index.html 200\n");
  writeFileSync(path.join(outputDir, "_headers"), cloudflareHeaders(backendOrigin, extraConnectOrigins));
}
