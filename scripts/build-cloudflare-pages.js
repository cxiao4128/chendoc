#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  containsServerSecretAssignment,
  exactHttpsOrigin,
  parseConnectOrigins,
  writeCloudflarePagesFiles,
} from "./cloudflare-pages-config.js";

const rootDir = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(rootDir, "apps", "admin", "dist");
const backendOrigin = exactHttpsOrigin(
  process.env.CHENDOC_CLOUDFLARE_BACKEND_ORIGIN || "",
  "CHENDOC_CLOUDFLARE_BACKEND_ORIGIN",
  "https://api.w92.pw",
);
const publicOrigin = exactHttpsOrigin(
  process.env.CHENDOC_CLOUDFLARE_PUBLIC_ORIGIN || "",
  "CHENDOC_CLOUDFLARE_PUBLIC_ORIGIN",
  "https://d.w92.pw",
);
const extraConnectOrigins = parseConnectOrigins(process.env.CHENDOC_CLOUDFLARE_CONNECT_ORIGINS);

function runAdminBuild() {
  if (process.platform === "win32") {
    execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd --prefix apps/admin run build"], {
      cwd: rootDir,
      stdio: "inherit",
    });
    return;
  }
  execFileSync("npm", ["--prefix", "apps/admin", "run", "build"], { cwd: rootDir, stdio: "inherit" });
}

function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path.join(directory, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

function verifyOutput() {
  const required = ["index.html", "chendoc-runtime-config.js", "route-preloads.js", "_headers", "_redirects"];
  for (const file of required) {
    if (!existsSync(path.join(outputDir, file))) throw new Error(`Cloudflare Pages output is missing ${file}.`);
  }
  const files = listFiles(outputDir);
  if (!files.some((file) => file.startsWith("assets/")) || !files.some((file) => file.startsWith("site-assets/"))) {
    throw new Error("Cloudflare Pages output is missing assets or site-assets.");
  }
  const forbidden = files.find((file) => (
    file === "_worker.js"
    || file.endsWith(".map")
    || /^(?:apps|server|scripts)\//.test(file)
    || /(^|\/)\.env(?:\..+)?$/i.test(file)
    || /\.(?:log|sqlite(?:-shm|-wal)?|zip)$/i.test(file)
  ));
  if (forbidden) throw new Error(`Cloudflare Pages output contains forbidden path: ${forbidden}`);

  for (const file of files.filter((name) => /\.(?:css|html|js|json|txt)$/i.test(name))) {
    if (containsServerSecretAssignment(readFileSync(path.join(outputDir, ...file.split("/")), "utf8"))) {
      throw new Error(`Cloudflare Pages output contains a server-secret assignment: ${file}`);
    }
  }

  const runtime = readFileSync(path.join(outputDir, "chendoc-runtime-config.js"), "utf8");
  if (!runtime.includes(JSON.stringify(backendOrigin)) || !runtime.includes(JSON.stringify(publicOrigin))) {
    throw new Error("Cloudflare Pages runtime origins do not match the build environment.");
  }
  if (readFileSync(path.join(outputDir, "_redirects"), "utf8").trim() !== "/* /index.html 200") {
    throw new Error("Cloudflare Pages SPA fallback is invalid.");
  }
}

runAdminBuild();
writeCloudflarePagesFiles({ outputDir, backendOrigin, publicOrigin, extraConnectOrigins });
verifyOutput();

console.log(`Cloudflare Pages output: ${path.relative(rootDir, outputDir)}`);
console.log(`API origin: ${backendOrigin}`);
console.log(`Public origin: ${publicOrigin}`);
