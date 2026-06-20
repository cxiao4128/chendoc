import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const dist = resolve(import.meta.dirname, "../dist");
if (!existsSync(dist)) throw new Error("dist 不存在，请先执行 Vite build");

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const output = files(dist);
const byWebPath = new Map(output.map((path) => [`/${path.slice(dist.length + 1).replaceAll("\\", "/")}`, path]));
const indexHtml = readFileSync(join(dist, "index.html"), "utf8");
for (const match of indexHtml.matchAll(/(?:src|href)="([^"?#]+)["?#]?/g)) {
  const target = match[1];
  if (!target.startsWith("/") || target.startsWith("//")) continue;
  if (!byWebPath.has(target)) throw new Error(`构建产物引用 404：${target}`);
}

for (const cssPath of output.filter((path) => extname(path) === ".css")) {
  const css = readFileSync(cssPath, "utf8");
  for (const match of css.matchAll(/url\((['"]?)([^)'"?#]+)\1\)/g)) {
    const target = match[2];
    if (/^(?:data:|https?:|\/\/)/.test(target)) continue;
    const absolute = target.startsWith("/")
      ? target
      : `/${resolve(cssPath, "..", target).slice(dist.length + 1).replaceAll("\\", "/")}`;
    if (!byWebPath.has(absolute)) throw new Error(`CSS 资源引用 404：${absolute}`);
  }
}

const js = output.filter((path) => extname(path) === ".js");
const css = output.filter((path) => extname(path) === ".css");
const images = output.filter((path) => /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(path));
const jsGzipBytes = js.reduce((sum, path) => sum + gzipSync(readFileSync(path)).byteLength, 0);
const cssBytes = css.reduce((sum, path) => sum + statSync(path).size, 0);
const imageBytes = images.reduce((sum, path) => sum + statSync(path).size, 0);
const largestImage = Math.max(0, ...images.map((path) => statSync(path).size));
const htmlTags = Array.from(indexHtml.matchAll(/<(script|link)\b([^>]*)>/g));
const initialJsUrls = htmlTags
  .filter(([, tag, attrs]) =>
    (tag === "script" && /type="module"/.test(attrs))
    || (tag === "link" && /rel="modulepreload"/.test(attrs)))
  .map(([, , attrs]) => /(?:src|href)="([^"?#]+)"/.exec(attrs)?.[1])
  .filter(Boolean);
const initialCssUrls = htmlTags
  .filter(([, tag, attrs]) => tag === "link" && /rel="stylesheet"/.test(attrs))
  .map(([, , attrs]) => /href="([^"?#]+)"/.exec(attrs)?.[1])
  .filter(Boolean);
const initialJs = initialJsUrls.map((url) => byWebPath.get(url)).filter(Boolean);
const initialCss = initialCssUrls.map((url) => byWebPath.get(url)).filter(Boolean);
const initialJsGzipBytes = [...new Set(initialJs)]
  .reduce((sum, path) => sum + gzipSync(readFileSync(path)).byteLength, 0);
const initialCssGzipBytes = [...new Set(initialCss)]
  .reduce((sum, path) => sum + gzipSync(readFileSync(path)).byteLength, 0);

const metrics = { jsGzipBytes, cssBytes, imageBytes, largestImage, initialJsGzipBytes, initialCssGzipBytes };
const budgets = {
  jsGzipBytes: 450 * 1024,
  cssBytes: 300 * 1024,
  imageBytes: 6 * 1024 * 1024,
  largestImage: 250 * 1024,
  initialJsGzipBytes: 120 * 1024,
  initialCssGzipBytes: 40 * 1024
};
for (const [name, limit] of Object.entries(budgets)) {
  const actual = metrics[name];
  if (actual > limit) throw new Error(`构建预算超限：${name}=${actual}，limit=${limit}`);
}
console.log(JSON.stringify(metrics));
