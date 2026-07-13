#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
const skipBuild = args.includes("--skip-build");

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
const cloudflareZip = path.join(releaseDir, `chendoc-${version}-cloudflare-pages.zip`);
const serverZip = path.join(releaseDir, `chendoc-${version}-server.zip`);
const checksumsFile = path.join(releaseDir, `chendoc-${version}-SHA256SUMS.txt`);

function runBuild() {
  if (skipBuild) return;
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
  const required = kind === "cloudflare"
    ? [
      "index.html",
      "chendoc-runtime-config.js",
      "route-preloads.js",
      "_headers",
      "_redirects",
    ]
    : [
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
    ];
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
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

console.log(`ChenDoc v${version} 双部署打包`);
console.log(`Cloudflare API: ${backendOrigin}`);
mkdirSync(releaseDir, { recursive: true });
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

try {
  runBuild();
  const cloudflareCount = prepareCloudflarePackage();
  const serverCount = prepareServerPackage();
  const cloudflareBuffer = await createZip(cloudflareStage, cloudflareZip);
  const serverBuffer = await createZip(serverStage, serverZip);
  await verifyZip(cloudflareBuffer, "cloudflare");
  await verifyZip(serverBuffer, "server");

  const checksums = [
    `${sha256(cloudflareBuffer)}  ${path.basename(cloudflareZip)}`,
    `${sha256(serverBuffer)}  ${path.basename(serverZip)}`,
  ].join("\n") + "\n";
  writeFileSync(checksumsFile, checksums);

  console.log(`Cloudflare Pages: ${path.relative(rootDir, cloudflareZip)} (${cloudflareCount} files)`);
  console.log(`Normal server: ${path.relative(rootDir, serverZip)} (${serverCount} files)`);
  console.log(`SHA-256: ${path.relative(rootDir, checksumsFile)}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
