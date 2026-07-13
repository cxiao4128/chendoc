#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  lstatSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import {
  containsServerSecretAssignment,
  exactHttpsOrigin,
  parseConnectOrigins,
  writeCloudflarePagesFiles,
} from "./cloudflare-pages-config.js";

const rootDir = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
if (args.includes("--skip-build")) {
  throw new Error("--skip-build is disabled: deployment packages must be created from a fresh build.");
}

function argument(name) {
  const inline = args.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || "").trim() : "";
}

const backendOrigin = exactHttpsOrigin(
  argument("--backend-origin") || process.env.CHENDOC_CLOUDFLARE_BACKEND_ORIGIN || "",
  "--backend-origin",
  "https://api.w92.pw",
);
const publicOrigin = exactHttpsOrigin(
  argument("--public-origin") || process.env.CHENDOC_CLOUDFLARE_PUBLIC_ORIGIN || "",
  "--public-origin",
  "https://d.w92.pw",
);
const extraConnectOrigins = parseConnectOrigins(
  argument("--connect-origin") || process.env.CHENDOC_CLOUDFLARE_CONNECT_ORIGINS || "",
  "--connect-origin",
);

const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = pkg.version;
const releaseDir = path.join(rootDir, "release");
const tempDir = path.join(rootDir, ".tmp", `deployments-${version}`);
const cloudflareStage = path.join(tempDir, "cloudflare-pages");
const serverStage = path.join(tempDir, "server");
const backendStage = path.join(tempDir, "backend");
const cloudflareZip = path.join(releaseDir, `chendoc-${version}-cloudflare-pages.zip`);
const serverZip = path.join(releaseDir, `chendoc-${version}-server.zip`);
const backendZip = path.join(releaseDir, `chendoc-${version}-backend.zip`);
const checksumsFile = path.join(releaseDir, `chendoc-${version}-SHA256SUMS.txt`);

function runBuild() {
  if (process.platform === "win32") {
    execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd run build"], { cwd: rootDir, stdio: "inherit" });
    return;
  }
  execFileSync("npm", ["run", "build"], { cwd: rootDir, stdio: "inherit" });
}

function ensureDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyTree(source, target, filter = () => true) {
  let count = 0;
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (!filter(sourcePath, entry)) continue;
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      count += copyTree(sourcePath, targetPath, filter);
    } else if (entry.isFile()) {
      ensureDir(targetPath);
      copyFileSync(sourcePath, targetPath);
      count += 1;
    }
  }
  return count;
}

function prepareCloudflarePackage() {
  const adminDist = path.join(rootDir, "apps", "admin", "dist");
  if (!existsSync(path.join(adminDist, "index.html"))) {
    throw new Error("Admin dist is missing. Run npm run build first.");
  }
  mkdirSync(cloudflareStage, { recursive: true });
  const count = copyTree(adminDist, cloudflareStage, (sourcePath, entry) => (
    entry.isDirectory() || path.extname(sourcePath).toLowerCase() !== ".map"
  ));
  writeCloudflarePagesFiles({
    outputDir: cloudflareStage,
    backendOrigin,
    publicOrigin,
    extraConnectOrigins,
  });
  return count + 2;
}

const allowedRootDirs = new Set(["apps", "server", "scripts"]);
const allowedRootFiles = new Set([
  ".editorconfig",
  ".env.example",
  ".node-version",
  "CHANGELOG.md",
  "CLOUDFLARE_DEPLOY.md",
  "LICENSE",
  "README.md",
  "deploy.sh",
  "ecosystem.config.cjs",
  "package-lock.json",
  "package.json",
  "start.sh",
  "stop.sh",
]);
const allowedPackageTrees = [
  "apps/admin/public",
  "apps/admin/scripts",
  "apps/admin/src",
  "server/scripts",
  "server/src",
];
const allowedPackageFiles = new Set([
  ...allowedRootFiles,
  "apps/admin/index.html",
  "apps/admin/package.json",
  "apps/admin/tsconfig.json",
  "apps/admin/vite.config.ts",
  "server/package.json",
  "server/tsconfig.json",
  "scripts/backup-db.js",
  "scripts/backup-r2.js",
  "scripts/backup-sqlite.js",
  "scripts/build-cloudflare-pages.js",
  "scripts/check-architecture.js",
  "scripts/cloudflare-pages-config.js",
  "scripts/copy-admin-dist.js",
  "scripts/install-maintenance-cron.sh",
  "scripts/maintenance.sh",
  "scripts/preflight-deploy.js",
  "scripts/release.js",
  "scripts/release.ps1",
  "scripts/rotate-logs.sh",
  "scripts/sync-env-example.js",
  "scripts/verify-backup.js",
]);
const excludedSegments = new Set([
  ".git",
  ".tmp",
  "dist",
  "node_modules",
  "release",
]);
const excludedRuntimePaths = [
  "server/backups",
  "server/data",
  "server/logs",
];

const allowedBackendRootDirs = new Set(["server", "scripts"]);
const allowedBackendRootFiles = new Set([
  ".editorconfig",
  ".env.example",
  ".node-version",
  "CHANGELOG.md",
  "CLOUDFLARE_DEPLOY.md",
  "LICENSE",
  "README.md",
  "deploy-backend.sh",
  "ecosystem.backend.config.cjs",
  "package-lock.json",
  "package.json",
  "start-backend.sh",
  "stop.sh",
]);
const allowedBackendTrees = [
  "server/dist",
];
const allowedBackendFiles = new Set([
  ...allowedBackendRootFiles,
  "server/package.json",
  "scripts/backup-db.js",
  "scripts/backup-r2.js",
  "scripts/backup-sqlite.js",
  "scripts/install-maintenance-cron.sh",
  "scripts/maintenance.sh",
  "scripts/preflight-deploy.js",
  "scripts/rotate-logs.sh",
  "scripts/verify-backup.js",
]);

function isPathOrChild(normalizedPath, excludedPath) {
  return normalizedPath === excludedPath || normalizedPath.startsWith(`${excludedPath}/`);
}

function isAllowedPackagePath(normalizedPath, entry) {
  if (allowedPackageFiles.has(normalizedPath)) return true;
  if (allowedPackageTrees.some((root) => isPathOrChild(normalizedPath, root))) return true;
  if (!entry.isDirectory()) return false;
  return allowedPackageTrees.some((root) => root.startsWith(`${normalizedPath}/`))
    || [...allowedPackageFiles].some((file) => file.startsWith(`${normalizedPath}/`));
}

function serverPathAllowed(relativePath, entry) {
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const leaf = segments.at(-1) || "";
  if (!isAllowedPackagePath(normalized, entry)) return false;
  if (segments.some((segment) => excludedSegments.has(segment))) return false;
  if (excludedRuntimePaths.some((excludedPath) => isPathOrChild(normalized, excludedPath))) return false;
  if (normalized.startsWith("server/public/admin/")) return false;
  if (leaf.startsWith(".env") && normalized !== ".env.example") return false;
  if (/\.(?:log|sqlite(?:-shm|-wal)?|zip|map)$/i.test(leaf)) return false;
  if (/\.(?:spec|test)\.[cm]?[jt]sx?$/i.test(leaf)) return false;
  if (entry.isDirectory() && ["coverage", "reports"].includes(leaf)) return false;
  return true;
}

function copyServerEntry(sourcePath, relativePath) {
  const entry = lstatSync(sourcePath);
  if (entry.isSymbolicLink()) {
    throw new Error(`Refusing to package symbolic link: ${relativePath.replace(/\\/g, "/")}`);
  }
  const dirent = {
    isDirectory: () => entry.isDirectory(),
    isFile: () => entry.isFile(),
  };
  if (!serverPathAllowed(relativePath, dirent)) return 0;
  if (entry.isDirectory()) {
    let count = 0;
    for (const name of readdirSync(sourcePath)) {
      count += copyServerEntry(path.join(sourcePath, name), path.join(relativePath, name));
    }
    return count;
  }
  if (!entry.isFile()) return 0;
  const destination = path.join(serverStage, relativePath);
  ensureDir(destination);
  copyFileSync(sourcePath, destination);
  return 1;
}

function prepareServerPackage() {
  mkdirSync(serverStage, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !allowedRootDirs.has(entry.name)) continue;
    if (entry.isFile() && !allowedRootFiles.has(entry.name)) continue;
    count += copyServerEntry(path.join(rootDir, entry.name), entry.name);
  }
  return count;
}

function isAllowedBackendPath(normalizedPath, entry) {
  if (allowedBackendFiles.has(normalizedPath)) return true;
  if (allowedBackendTrees.some((root) => isPathOrChild(normalizedPath, root))) return true;
  if (!entry.isDirectory()) return false;
  return allowedBackendTrees.some((root) => root.startsWith(`${normalizedPath}/`))
    || [...allowedBackendFiles].some((file) => file.startsWith(`${normalizedPath}/`));
}

function backendPathAllowed(relativePath, entry) {
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const leaf = segments.at(-1) || "";
  if (!isAllowedBackendPath(normalized, entry)) return false;
  if (segments.some((segment) => excludedSegments.has(segment)
    && !(segment === "dist" && (normalized === "server/dist" || normalized.startsWith("server/dist/"))))) return false;
  if (excludedRuntimePaths.some((excludedPath) => isPathOrChild(normalized, excludedPath))) return false;
  if (normalized === "apps" || normalized.startsWith("apps/")) return false;
  if (normalized === "server/public" || normalized.startsWith("server/public/")) return false;
  if (leaf.startsWith(".env") && normalized !== ".env.example") return false;
  if (/\.(?:log|sqlite(?:-shm|-wal)?|zip|map)$/i.test(leaf)) return false;
  if (/\.(?:spec|test)\.[cm]?[jt]sx?$/i.test(leaf)) return false;
  if (entry.isDirectory() && ["coverage", "reports"].includes(leaf)) return false;
  return true;
}

function copyBackendEntry(sourcePath, relativePath) {
  const entry = lstatSync(sourcePath);
  if (entry.isSymbolicLink()) {
    throw new Error(`Refusing to package backend symbolic link: ${relativePath.replace(/\\/g, "/")}`);
  }
  const dirent = {
    isDirectory: () => entry.isDirectory(),
    isFile: () => entry.isFile(),
  };
  if (!backendPathAllowed(relativePath, dirent)) return 0;
  if (entry.isDirectory()) {
    let count = 0;
    for (const name of readdirSync(sourcePath)) {
      count += copyBackendEntry(path.join(sourcePath, name), path.join(relativePath, name));
    }
    return count;
  }
  if (!entry.isFile()) return 0;
  const destination = path.join(backendStage, relativePath);
  ensureDir(destination);
  copyFileSync(sourcePath, destination);
  return 1;
}

const forbiddenBackendPackageNames = new Set([
  "@chendoc/admin",
  "@fastify/static",
  "@playwright/test",
  "concurrently",
  "esbuild",
  "happy-dom",
  "jsdom",
  "lucide-vue-next",
  "pinia",
  "playwright",
  "playwright-core",
  "rollup",
  "tsx",
  "typescript",
  "vite",
  "vitest",
  "vue",
  "vue-router",
]);
const forbiddenBackendPackagePrefixes = [
  "@esbuild/",
  "@playwright/",
  "@rollup/",
  "@tiptap/",
  "@vitejs/",
  "@vitest/",
  "@vue/",
  "prosemirror-",
];

function backendPackageNameFromLockPath(packagePath) {
  const segments = packagePath.split("/");
  const nodeModulesIndex = segments.lastIndexOf("node_modules");
  if (nodeModulesIndex < 0 || nodeModulesIndex === segments.length - 1) return "";
  const first = segments[nodeModulesIndex + 1];
  return first.startsWith("@") && segments[nodeModulesIndex + 2]
    ? `${first}/${segments[nodeModulesIndex + 2]}`
    : first;
}

function isForbiddenBackendPackageName(packageName) {
  return forbiddenBackendPackageNames.has(packageName)
    || forbiddenBackendPackagePrefixes.some((prefix) => packageName.startsWith(prefix));
}

function verifyBackendLock(packageLock) {
  const packages = packageLock.packages;
  if (!packages || typeof packages !== "object") {
    throw new Error("Backend package lockfile has no package inventory.");
  }
  if (!packages.server) {
    throw new Error("Backend package lockfile does not contain the server workspace.");
  }
  if (!packages["node_modules/@chendoc/server"]?.link) {
    throw new Error("Backend package lockfile does not contain the server workspace link.");
  }
  const leakedEntry = Object.keys(packages).find((packagePath) => (
    packagePath === "apps/admin"
    || packagePath.startsWith("apps/admin/")
    || isForbiddenBackendPackageName(backendPackageNameFromLockPath(packagePath))
  ));
  if (leakedEntry) {
    throw new Error(`Backend package lockfile contains frontend/build metadata: ${leakedEntry}`);
  }
  for (const [packagePath, metadata] of Object.entries(packages)) {
    for (const dependencyName of Object.keys(metadata?.dependencies || {})) {
      if (isForbiddenBackendPackageName(dependencyName)) {
        throw new Error(`Backend package lockfile references frontend/build dependency ${dependencyName} from ${packagePath || "root"}.`);
      }
    }
  }
}

function resolveLockedDependency(packages, fromPath, dependencyName) {
  let base = fromPath;
  while (true) {
    const candidate = base
      ? `${base}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (packages[candidate]) return candidate;
    const nestedIndex = base.lastIndexOf("/node_modules/");
    if (nestedIndex >= 0) {
      base = base.slice(0, nestedIndex);
      continue;
    }
    if (!base) return "";
    base = "";
  }
}

function pruneBackendLock(packageLock) {
  const packages = packageLock.packages;
  const selected = new Set(["", "server", "node_modules/@chendoc/server"]);
  const queue = ["server"];
  while (queue.length > 0) {
    const packagePath = queue.shift();
    const metadata = packages[packagePath];
    if (!metadata) throw new Error(`Backend lock dependency is missing metadata: ${packagePath}`);
    const optionalNames = new Set(Object.keys(metadata.optionalDependencies || {}));
    const dependencyNames = new Set([
      ...Object.keys(metadata.dependencies || {}),
      ...optionalNames,
      ...Object.keys(metadata.peerDependencies || {}).filter((name) => !metadata.peerDependenciesMeta?.[name]?.optional),
    ]);
    for (const dependencyName of dependencyNames) {
      const dependencyPath = resolveLockedDependency(packages, packagePath, dependencyName);
      if (!dependencyPath) {
        if (optionalNames.has(dependencyName)) continue;
        throw new Error(`Backend lock cannot resolve ${dependencyName} from ${packagePath}.`);
      }
      if (selected.has(dependencyPath)) continue;
      selected.add(dependencyPath);
      queue.push(dependencyPath);
    }
  }
  const prunedPackages = {};
  for (const [packagePath, metadata] of Object.entries(packages)) {
    if (!selected.has(packagePath)) continue;
    const retained = { ...metadata };
    delete retained.dev;
    delete retained.devOptional;
    prunedPackages[packagePath] = retained;
  }
  packageLock.packages = prunedPackages;
  return packageLock;
}

function prepareBackendPackage() {
  mkdirSync(backendStage, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !allowedBackendRootDirs.has(entry.name)) continue;
    if (entry.isFile() && !allowedBackendRootFiles.has(entry.name)) continue;
    count += copyBackendEntry(path.join(rootDir, entry.name), entry.name);
  }
  const compiledSource = path.join(backendStage, "server/dist");
  const compiledTarget = path.join(backendStage, "server/backend-dist");
  if (!existsSync(path.join(compiledSource, "server.js"))) {
    throw new Error("Backend build output is missing server/dist/server.js.");
  }
  renameSync(compiledSource, compiledTarget);
  for (const legacyModule of [
    "modules/public/public-api.js",
    "modules/public/public.routes.js",
    "modules/public/public.service.js",
    "modules/public/renderShareHtml.js",
    "modules/public/sharePageStyle.js",
    "modules/forms/forms.public.js",
    "modules/forms/public-api.js",
  ]) {
    rmSync(path.join(compiledTarget, legacyModule), { force: true });
  }
  const packagePath = path.join(backendStage, "package.json");
  const lockPath = path.join(backendStage, "package-lock.json");
  const serverPackagePath = path.join(backendStage, "server/package.json");
  const backendPackage = JSON.parse(readFileSync(packagePath, "utf8"));
  const backendServerPackage = JSON.parse(readFileSync(serverPackagePath, "utf8"));
  const pm2Version = backendPackage.devDependencies?.pm2;
  if (!pm2Version) throw new Error("Backend package requires a pinned PM2 version.");
  backendPackage.name = "chendoc-backend";
  backendPackage.description = "ChenDoc API-only backend for split Cloudflare Pages deployment.";
  backendPackage.workspaces = ["server"];
  backendPackage.dependencies = {};
  backendPackage.devDependencies = {};
  backendPackage.scripts = {
    start: "bash ./start-backend.sh",
    "db:migrate": "node server/dist/db/migrate.js",
    "db:backup": "node scripts/backup-db.js",
    "db:backup:verify": "node scripts/verify-backup.js",
    "deploy:preflight": "node scripts/preflight-deploy.js",
    "admin:init": "node server/dist/scripts/init-admin.js",
    "r2:backup": "node scripts/backup-r2.js",
    "uploads:cleanup": "node server/dist/scripts/cleanup-orphan-uploads.js",
  };
  writeFileSync(packagePath, `${JSON.stringify(backendPackage, null, 2)}\n`);

  delete backendServerPackage.dependencies["@fastify/static"];
  backendServerPackage.dependencies.pm2 = pm2Version;
  backendServerPackage.devDependencies = {};
  backendServerPackage.scripts = {
    start: "node -e \"process.env.CHENDOC_SERVE_ADMIN='false'; import('./dist/server.js')\"",
    "db:migrate": "node dist/db/migrate.js",
    "admin:init": "node dist/scripts/init-admin.js",
    "uploads:cleanup": "node dist/scripts/cleanup-orphan-uploads.js",
  };
  writeFileSync(serverPackagePath, `${JSON.stringify(backendServerPackage, null, 2)}\n`);

  const backendLock = JSON.parse(readFileSync(lockPath, "utf8"));
  backendLock.name = backendPackage.name;
  backendLock.version = backendPackage.version;
  const lockRoot = backendLock.packages?.[""];
  if (!lockRoot) throw new Error("Backend package lockfile has no root package metadata.");
  lockRoot.name = backendPackage.name;
  lockRoot.version = backendPackage.version;
  lockRoot.workspaces = ["server"];
  delete lockRoot.dependencies;
  delete lockRoot.devDependencies;
  for (const packageName of Object.keys(backendLock.packages)) {
    if (packageName === "apps/admin" || packageName.startsWith("apps/admin/")) {
      delete backendLock.packages[packageName];
    }
  }
  delete backendLock.packages["node_modules/@chendoc/admin"];
  const lockServer = backendLock.packages.server;
  if (!lockServer) throw new Error("Backend package lockfile has no server workspace metadata.");
  delete lockServer.dependencies?.["@fastify/static"];
  lockServer.dependencies = { ...lockServer.dependencies, pm2: pm2Version };
  delete lockServer.devDependencies;
  pruneBackendLock(backendLock);
  verifyBackendLock(backendLock);
  writeFileSync(lockPath, `${JSON.stringify(backendLock, null, 2)}\n`);

  const envExamplePath = path.join(backendStage, ".env.example");
  let backendEnvExample = readFileSync(envExamplePath, "utf8");
  for (const [name, value] of Object.entries({
    HOST: "127.0.0.1",
    PUBLIC_SITE_URL: publicOrigin,
    CHENDOC_API_ORIGIN: backendOrigin,
    CHENDOC_ADMIN_ORIGINS: publicOrigin,
    CHENDOC_R2_CORS_ORIGINS: publicOrigin,
    CHENDOC_SERVE_ADMIN: "false",
  })) {
    const assignment = `${name}=${value}`;
    const pattern = new RegExp(`^${name}=.*$`, "m");
    backendEnvExample = pattern.test(backendEnvExample)
      ? backendEnvExample.replace(pattern, assignment)
      : `${backendEnvExample.trimEnd()}\n${assignment}\n`;
  }
  writeFileSync(envExamplePath, backendEnvExample);
  return count;
}

async function createZip(sourceDir, outputPath) {
  const zip = new JSZip();
  function addDirectory(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) addDirectory(fullPath, zipPath);
      else if (entry.isFile()) {
        let content = readFileSync(fullPath);
        if (/\.sh$/i.test(entry.name)) content = Buffer.from(content.toString("utf8").replace(/\r\n/g, "\n"));
        zip.file(zipPath, content, { unixPermissions: /\.sh$/i.test(entry.name) ? 0o100755 : 0o100644 });
      }
    }
  }
  addDirectory(sourceDir);
  const output = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });
  writeFileSync(outputPath, output);
  return output;
}

async function verifyZip(buffer, kind) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const requiredByKind = {
    cloudflare: [
      "index.html",
      "chendoc-runtime-config.js",
      "route-preloads.js",
      "_headers",
      "_redirects",
    ],
    server: [
      "deploy.sh",
      "package.json",
      "package-lock.json",
      ".env.example",
      "apps/admin/package.json",
      "apps/admin/src/features/settings/logs/public-api.ts",
      "apps/admin/src/features/settings/logs/types.ts",
      "apps/admin/src/features/settings/logs/hooks/index.ts",
      "apps/admin/src/features/settings/logs/hooks/useOperationLogs.ts",
      "apps/admin/src/features/settings/logs/services/logs.service.ts",
      "server/package.json",
    ],
    backend: [
      "deploy-backend.sh",
      "start-backend.sh",
      "ecosystem.backend.config.cjs",
      "package.json",
      "package-lock.json",
      ".env.example",
      "server/package.json",
      "server/backend-dist/server.js",
      "scripts/preflight-deploy.js",
      "scripts/verify-backup.js",
    ],
  };
  const required = requiredByKind[kind];
  if (!required) throw new Error(`Unknown package kind: ${kind}`);
  for (const file of required) {
    if (!files.includes(file)) throw new Error(`${kind} package is missing ${file}`);
  }
  if (kind === "cloudflare" && (!files.some((name) => name.startsWith("assets/")) || !files.some((name) => name.startsWith("site-assets/")))) {
    throw new Error("Cloudflare package is missing assets or site-assets.");
  }
  const forbidden = files.find((name) => (
    name.startsWith("chendoc/")
    || name.includes("/node_modules/")
    || name.startsWith("node_modules/")
    || (/(^|\/)\.env(\..+)?$/i.test(name) && (kind === "cloudflare" || name !== ".env.example"))
    || /\.(?:log|sqlite(?:-shm|-wal)?|zip)$/i.test(name)
    || (kind === "cloudflare" && (name === "_worker.js" || name.endsWith(".map")))
    || name.includes("apps/admin/apps/admin/")
    || name.includes("server/server/")
    || (kind === "cloudflare" && /^(?:apps|server|scripts)\//.test(name))
    || (kind === "backend" && (
      name === "apps"
      || name.startsWith("apps/")
      || name === "server/public/admin"
      || name.startsWith("server/public/admin/")
      || name === "server/public"
      || name.startsWith("server/public/")
      || name === "server/dist"
      || name.startsWith("server/dist/")
      || name === "index.html"
      || name === "chendoc-runtime-config.js"
      || name === "route-preloads.js"
      || name === "_headers"
      || name === "_redirects"
      || name.startsWith("assets/")
      || name.startsWith("site-assets/")
      || /(?:^|\/)vite\.config\.[cm]?[jt]s$/i.test(name)
      || /\.(?:avif|css|gif|html?|ico|jpe?g|map|png|svg|ttf|vue|webp|woff2?)$/i.test(name)
    ))
  ));
  if (forbidden) throw new Error(`${kind} package contains forbidden path: ${forbidden}`);
  if (kind === "cloudflare") {
    const runtime = await zip.file("chendoc-runtime-config.js")?.async("string");
    if (!runtime || !runtime.includes(JSON.stringify(backendOrigin)) || !runtime.includes(JSON.stringify(publicOrigin))) {
      throw new Error("Cloudflare runtime origins do not match the requested API/public origins.");
    }
    const redirects = await zip.file("_redirects")?.async("string");
    if (redirects?.trim() !== "/* /index.html 200") {
      throw new Error("Cloudflare package has an invalid SPA fallback.");
    }
    for (const name of files.filter((file) => /\.(?:css|html|js|json|txt)$/i.test(file))) {
      const content = await zip.file(name)?.async("string");
      if (containsServerSecretAssignment(content)) {
        throw new Error(`Cloudflare package contains a server-secret assignment: ${name}`);
      }
    }
  }
  if (kind === "backend") {
    const rootPackage = JSON.parse(await zip.file("package.json").async("string"));
    const serverPackage = JSON.parse(await zip.file("server/package.json").async("string"));
    const packageLock = JSON.parse(await zip.file("package-lock.json").async("string"));
    const envExample = await zip.file(".env.example").async("string");
    if (!Array.isArray(rootPackage.workspaces) || !rootPackage.workspaces.includes("server")) {
      throw new Error("Backend package root package.json does not expose the server workspace.");
    }
    if (rootPackage.workspaces.length !== 1 || rootPackage.workspaces[0] !== "server") {
      throw new Error("Backend package root package.json exposes a non-server workspace.");
    }
    if (JSON.stringify(rootPackage.scripts || {}).includes("apps/admin")) {
      throw new Error("Backend package root scripts still reference the admin frontend.");
    }
    if (rootPackage.scripts?.start !== "bash ./start-backend.sh") {
      throw new Error("Backend package root npm start does not enforce API-only startup.");
    }
    if (serverPackage.scripts?.start !== "node -e \"process.env.CHENDOC_SERVE_ADMIN='false'; import('./dist/server.js')\"") {
      throw new Error("Backend server workspace npm start does not force CHENDOC_SERVE_ADMIN=false.");
    }
    if (serverPackage.dependencies?.["@fastify/static"] || serverPackage.devDependencies?.vitest || serverPackage.devDependencies?.tsx) {
      throw new Error("Backend package still installs static-serving or test-only tooling.");
    }
    if (!serverPackage.dependencies?.pm2) {
      throw new Error("Backend package does not retain PM2 as a production dependency.");
    }
    if (files.some((name) => name.startsWith("server/src/") || name.startsWith("server/scripts/"))) {
      throw new Error("Backend package still contains build-time server sources.");
    }
    const presentationModule = files.find((name) => (
      name.startsWith("server/backend-dist/")
      && (
        /(?:^|\/)render[^/]*html\.[cm]?js$/i.test(name)
        || /(?:^|\/)[^/]*pageStyle\.[cm]?js$/i.test(name)
        || /\/modules\/public\/(?:public-api|public\.routes|public\.service)\.[cm]?js$/i.test(name)
        || /\/modules\/forms\/(?:forms\.public|public-api)\.[cm]?js$/i.test(name)
      )
    ));
    if (presentationModule) {
      throw new Error(`Backend package still contains a server-rendered presentation module: ${presentationModule}`);
    }
    verifyBackendLock(packageLock);
    for (const expected of [
      `HOST=127.0.0.1`,
      `PUBLIC_SITE_URL=${publicOrigin}`,
      `CHENDOC_API_ORIGIN=${backendOrigin}`,
      `CHENDOC_ADMIN_ORIGINS=${publicOrigin}`,
      `CHENDOC_R2_CORS_ORIGINS=${publicOrigin}`,
      "CHENDOC_SERVE_ADMIN=false",
    ]) {
      if (!envExample.split(/\r?\n/).includes(expected)) {
        throw new Error(`Backend package .env.example is missing ${expected}`);
      }
    }
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

console.log(`ChenDoc v${version} 三部署打包`);
console.log(`Cloudflare API: ${backendOrigin}`);
mkdirSync(releaseDir, { recursive: true });
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

try {
  runBuild();
  const cloudflareCount = prepareCloudflarePackage();
  const serverCount = prepareServerPackage();
  const backendCount = prepareBackendPackage();
  const cloudflareBuffer = await createZip(cloudflareStage, cloudflareZip);
  const serverBuffer = await createZip(serverStage, serverZip);
  const backendBuffer = await createZip(backendStage, backendZip);
  await verifyZip(cloudflareBuffer, "cloudflare");
  await verifyZip(serverBuffer, "server");
  await verifyZip(backendBuffer, "backend");

  const checksums = [
    `${sha256(cloudflareBuffer)}  ${path.basename(cloudflareZip)}`,
    `${sha256(serverBuffer)}  ${path.basename(serverZip)}`,
    `${sha256(backendBuffer)}  ${path.basename(backendZip)}`,
  ].join("\n") + "\n";
  writeFileSync(checksumsFile, checksums);

  console.log(`Cloudflare Pages: ${path.relative(rootDir, cloudflareZip)} (${cloudflareCount} files)`);
  console.log(`Normal server: ${path.relative(rootDir, serverZip)} (${serverCount} files)`);
  console.log(`Backend only: ${path.relative(rootDir, backendZip)} (${backendCount} files)`);
  console.log(`SHA-256: ${path.relative(rootDir, checksumsFile)}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
