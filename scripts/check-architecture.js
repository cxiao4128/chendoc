/**
 * ChenDoc 架构边界检查脚本
 *
 * 检查内容：
 * 1. 前端 import 边界（禁止组件/页面直接调 API）
 * 2. 后端 import 边界（禁止 route/service 越权）
 * 3. 跨模块只能走 public-api.ts
 * 4. 既有架构契约（版本同步、Gateway 边界等）
 *
 * 使用方式：
 * - npm run check:architecture        # 宽松模式：记录违规但允许已有违规
 * - npm run check:architecture --strict  # 严格模式：任何违规都报错
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { cwd } from "node:process";

const root = resolve(cwd());
const failures = [];
const warnings = [];

// 严格模式：任何违规都报错
const isStrictMode = process.argv.includes("--strict");

// 当前已知的违规白名单（允许存在，但新增违规会被检测）
const KNOWN_VIOLATIONS = new Set([
  // 前端：组件直接调旧 API（待迁移）
  "components/docs/DocTree.vue",
  "components/docs/ShareDialog.vue",
  "components/layout/AppHeader.vue",
  "components/stats/DocStatsOverview.vue",
  "components/stats/DocStatsRecent.vue",
  "components/tags/TagColorPalette.vue",
  "components/tags/TagIconPalette.vue",
  "components/tags/TagList.vue",
  "components/tags/TagListItem.vue",
  "components/tags/TagManager.vue",
  "features/documents/hooks/useDocumentBulkActions.ts",
  "features/documents/hooks/useDocumentFileActions.ts",
  "features/documents/hooks/useDocumentStats.ts",
  "features/invites/hooks/useInviteList.ts",
  "pages/danger/DangerPage.vue",
  "pages/docs/components/DocEditorAside.vue",
  "pages/docs/components/DocEditorHeader.vue",
  "pages/docs/components/DocEditorSharePanel.vue",
  "pages/docs/components/DocSchedulePanel.vue",
  "pages/docs/components/DocVersionPanel.vue",
  "pages/docs/components/TrashAside.vue",
  "pages/docs/components/TrashTable.vue",
  "pages/docs/hooks/useDocEditorShell.ts",
  "pages/docs/KnowledgeBasePage.vue",
  "pages/docs/TemplateCenterPage.vue",
  "pages/login/ForgotPasswordPage.vue",
  "pages/login/useLoginPage.ts",
  "pages/register/RegisterPage.vue",
  "pages/reviews/ShareReviewPage.vue",
  "pages/settings/components/LogsSettingsSection.vue",
  "pages/settings/components/MaintenanceSettingsSection.vue",
  "pages/settings/components/RecoverySettingsSection.vue",
  "pages/settings/components/SecuritySettingsSection.vue",
  "pages/settings/components/SettingsOverviewPanel.vue",
  "pages/settings/components/ShareStatusSettingsSection.vue",
  "pages/settings/components/SiteSettingsSection.vue",
  "pages/settings/components/StorageSettingsSection.vue",
  "pages/settings/components/UsersSettingsSection.vue",
  "pages/settings/components/users/UserListSection.vue",
  "pages/settings/components/users/UserProfileInfoTab.vue",
  "pages/settings/components/users/UserProfileLogsTab.vue",
  "pages/settings/components/users/UserProfileRolesTab.vue",
  "pages/settings/SettingsStoragePage.vue",
  // stores（待拆分业务到 features）
  "stores/auth.ts",
  "stores/doc.cache.ts",
  "stores/doc.detail.spec.ts",
  "stores/doc.mutations.spec.ts",
  "stores/doc.spec.ts",
  "stores/doc.state.ts",
  "stores/doc.ts",
]);

function normalizeRelativePath(path) {
  return path.replace(/\\/g, "/");
}

function read(path) {
  try {
    return readFileSync(resolve(root, path), "utf8");
  } catch {
    return "";
  }
}

function assert(condition, message, fileHint = null) {
  if (!condition) {
    // 在非严格模式下，检查是否是已知违规
    if (!isStrictMode && fileHint && KNOWN_VIOLATIONS.has(normalizeRelativePath(fileHint))) {
      warnings.push(`[已记录] ${message}`);
      return;
    }
    failures.push(message);
  }
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

// ============= 辅助函数 =============

function findFiles(dir, extensions = [".ts", ".vue", ".js"]) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "build") {
          results.push(...findFiles(fullPath, extensions));
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch {
    // 目录不存在
  }
  return results;
}

function extractImports(content) {
  const imports = [];
  const regex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function isRelativeImport(imp) {
  return imp.startsWith(".") || imp.startsWith("@/") || imp.startsWith("~@/");
}

function normalizeImportPath(imp, fromFile) {
  if (imp.startsWith("@/")) {
    // Vue/Vite 别名
    const srcPath = resolve(root, "apps/admin/src");
    return resolve(srcPath, imp.slice(2));
  }
  if (imp.startsWith("~@/")) {
    const srcPath = resolve(root, "apps/admin/src");
    return resolve(srcPath, imp.slice(3));
  }
  if (imp.startsWith("./") || imp.startsWith("../")) {
    return resolve(fromFile, "..", imp);
  }
  return null;
}

// ============= 1. 前端 import 边界检查 =============

console.log("[ARCH] 检查前端 import 边界...");

const adminSrc = resolve(root, "apps/admin/src");
const apiDir = resolve(adminSrc, "api");
const servicesApiDir = resolve(adminSrc, "services/api");
const componentsDir = resolve(adminSrc, "components");
const pagesDir = resolve(adminSrc, "pages");
const featuresDir = resolve(adminSrc, "features");

// 1.1 禁止 components/** 直接调旧 api/*
const componentFiles = findFiles(componentsDir);
for (const file of componentFiles) {
  const content = read(file);
  const imports = extractImports(content);
  const relPath = relative(adminSrc, file);

  for (const imp of imports) {
    // 检查是否直接调旧 api/*
    if (imp.includes("/api/") && !imp.includes("/services/api/")) {
      assert(false, `[前端] ${relPath} 直接 import 了旧 API 层: ${imp}`, relPath);
    }
  }
}

// 1.2 禁止 pages/** 直接调 api/*
const pageFiles = findFiles(pagesDir);
for (const file of pageFiles) {
  const content = read(file);
  const imports = extractImports(content);
  const relPath = relative(adminSrc, file);

  for (const imp of imports) {
    if (imp.includes("/api/") && !imp.includes("/services/api/")) {
      assert(false, `[前端] ${relPath} 直接 import 了旧 API 层: ${imp}`, relPath);
    }
  }
}

// 1.3 禁止 features/A/** 直接调 features/B/hooks/* (跨 feature 内部)
const featureDirs = findFiles(featuresDir).filter(file => {
  const normalized = normalizeRelativePath(file);
  return normalized.includes("/hooks/") || normalized.includes("/services/");
});
for (const file of featureDirs) {
  const content = read(file);
  const imports = extractImports(content);
  const relPath = relative(adminSrc, file);

  for (const imp of imports) {
    if (imp.includes("/features/") && imp.includes("/hooks/")) {
      const targetPath = normalizeImportPath(imp, file);
      if (targetPath) {
        // 检查是否跨 feature
        const fromFeature = normalizeRelativePath(file).match(/\/features\/([^/]+)/)?.[1];
        const toFeature = normalizeRelativePath(targetPath).match(/\/features\/([^/]+)/)?.[1];
        if (fromFeature && toFeature && fromFeature !== toFeature) {
          assert(false, `[前端] ${relPath} 跨 feature 调内部 hooks: ${imp}`, relPath);
        }
      }
    }
  }
}

// 1.4 禁止 features/** 直接调旧 api/*
for (const file of featureDirs) {
  const content = read(file);
  const imports = extractImports(content);
  const relPath = relative(adminSrc, file);

  for (const imp of imports) {
    if (imp.includes("/api/") && !imp.includes("/services/api/")) {
      assert(false, `[前端] ${relPath} 直接 import 了旧 API 层: ${imp}`, relPath);
    }
  }
}

// 1.5 禁止 stores/** 直接调旧 api/*（允许通过 services/api/ 封装调用）
const storesDir = resolve(adminSrc, "stores");
const storeFiles = findFiles(storesDir, [".ts"]);
for (const file of storeFiles) {
  const content = read(file);
  const imports = extractImports(content);
  const relPath = relative(adminSrc, file);

  for (const imp of imports) {
    // 禁止直接调旧 api/*（不包括 services/api/）
    if (imp.includes("/api/") && !imp.includes("/services/api/")) {
      assert(false, `[前端] ${relPath} (stores) 不应直接调旧 API 层`, relPath);
    }
  }
}

// ============= 2. 后端 import 边界检查 =============

console.log("[ARCH] 检查后端 import 边界...");

const serverSrc = resolve(root, "server/src");
const modulesDir = resolve(serverSrc, "modules");

// 2.1 检查 routes 是否直接写复杂 SQL（简单检查：正则匹配 SELECT/WHERE/INSERT/UPDATE/DELETE）
function hasInlineSql(content) {
  // 排除注释和字符串中的 SQL
  const withoutComments = content
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  // 排除 TypeScript 类型中的关键词（如 "SELECT" 在类型联合中）
  const withoutTypeStrings = withoutComments
    .replace(/"[^"]*"/g, '""')  // 移除字符串字面量
    .replace(/'[^']*'/g, "''");  // 移除字符串字面量
  // 检查是否有明显的 SQL 关键词（非类型上下文中）
  return /\bSELECT\b.*\s+FROM\b/i.test(withoutTypeStrings) ||
         /\bINSERT\b\s+INTO\b/i.test(withoutTypeStrings) ||
         /\bUPDATE\b\s+\w+\s+SET\b/i.test(withoutTypeStrings) ||
         /\bDELETE\b\s+FROM\b/i.test(withoutTypeStrings);
}

const routesFiles = [];
function findRoutes(dir) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.endsWith(".routes.ts")) {
        routesFiles.push(join(dir, entry.name));
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        findRoutes(join(dir, entry.name));
      }
    }
  } catch {}
}
findRoutes(modulesDir);

for (const file of routesFiles) {
  const content = read(file);
  if (hasInlineSql(content)) {
    const relPath = relative(root, file);
    assert(false, `[后端] ${relPath} 包含内联 SQL (应移到 service 层)`);
  }
}

// 2.2 检查 repos 是否 import Fastify（repos 只封装 DB，不应依赖框架）
const reposDirs = [];
function findRepos(dir) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && entry.name === "repos") {
        reposDirs.push(fullPath);
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        findRepos(fullPath);
      }
    }
  } catch {}
}
findRepos(modulesDir);

for (const repoDir of reposDirs) {
  const repoFiles = findFiles(repoDir, [".ts"]);
  for (const file of repoFiles) {
    const content = read(file);
    if (content.includes("fastify") || content.includes("FastifyInstance") || content.includes("FastifyRequest")) {
      const relPath = relative(root, file);
      assert(false, `[后端] ${relPath} (repos) 不应 import Fastify`);
    }
  }
}

// 2.3 检查跨模块 import（禁止直接调内部 service/repo）
for (const moduleDir of readdirSync(modulesDir, { withFileTypes: true })) {
  if (!moduleDir.isDirectory() || moduleDir.name.startsWith(".")) continue;

  const modulePath = join(modulesDir, moduleDir.name);
  const moduleFiles = findFiles(modulePath, [".ts"]);

  for (const file of moduleFiles) {
    const content = read(file);
    const imports = extractImports(content);
    const fileName = moduleDir.name;

    for (const imp of imports) {
      // 检查是否跨模块调 service/repo (不包括 utils, db, config 等公共层)
      if (imp.includes("/modules/")) {
        const targetModule = imp.match(/\/modules\/([^/]+)/)?.[1];
        if (targetModule && targetModule !== fileName) {
          // 允许调 public-api
          if (!imp.includes("public-api")) {
            const relPath = relative(root, file);
            // 特殊豁免：utils, db, config, middleware 等公共层
            const isPublicLayer = ["utils", "db", "config", "middleware", "gateway", "plugins"].some(
              layer => imp.includes(`/${layer}/`)
            );
            if (!isPublicLayer) {
              assert(false, `[后端] ${relPath} 跨模块直接 import: ${imp} (应走 public-api.ts)`);
            }
          }
        }
      }
    }
  }
}

// 2.4 检查 public-api.ts 是否存在（每个模块应该有）
const expectedModules = [
  "auth", "docs", "editor", "trash", "search", "share", "public",
  "forms", "uploads", "comments", "tags", "exports", "security",
  "invites", "templates", "stats", "captcha", "spaces", "danger", "crypto"
];

// 后端 public-api 检查（警告级，因为当前状态就是缺失的）
for (const moduleName of expectedModules) {
  const modulePath = join(modulesDir, moduleName);
  const publicApiPath = join(modulePath, "public-api.ts");

  try {
    if (statSync(modulePath).isDirectory()) {
      const hasPublicApi = read(publicApiPath).length > 0;
      if (!hasPublicApi) {
        warn(false, `[后端] modules/${moduleName}/public-api.ts 不存在 (建议添加)`);
      }
    }
  } catch {
    // 模块不存在，跳过
  }
}

// 前端 public-api 检查
const expectedFeatures = [
  "documents", "editor", "recycle-bin", "share", "upload", "tags",
  "forms-list", "forms-editor", "forms-submissions",
  "comments", "share-reviews", "invites",
  "site", "storage", "users", "system", "logs", "security"
];

for (const featureName of expectedFeatures) {
  const featurePath = join(featuresDir, featureName);
  const publicApiPath = join(featurePath, "public-api.ts");

  try {
    if (statSync(featurePath).isDirectory()) {
      const hasPublicApi = read(publicApiPath).length > 0;
      if (!hasPublicApi) {
        warn(false, `[前端] features/${featureName}/public-api.ts 不存在 (建议添加)`);
      }
    }
  } catch {
    // feature 目录不存在，跳过
  }
}

// ============= 3. 既有架构契约检查（保留原有检查） =============

console.log("[ARCH] 检查架构契约...");

const versions = [
  "package.json",
  "apps/admin/package.json",
  "server/package.json"
].map(path => {
  try {
    return JSON.parse(read(path)).version;
  } catch {
    return null;
  }
}).filter(Boolean);

if (versions.length === 3 && new Set(versions).size > 1) {
  assert(false, `Workspace versions differ: ${versions.join(", ")}`);
}

const releaseVersion = versions[0];
if (releaseVersion) {
  const adminVersionCheck = read("apps/admin/src/pages/settings/SettingsPage.vue");
  if (adminVersionCheck && !adminVersionCheck.includes(`APP_VERSION = "v${releaseVersion}"`)) {
    assert(false, "Frontend displayed version differs from package version.");
  }

  const serverVersionCheck = read("server/src/modules/settings/settings.service.ts");
  if (serverVersionCheck && !serverVersionCheck.includes(`APP_VERSION = "${releaseVersion}"`)) {
    assert(false, "Backend displayed version differs from package version.");
  }
}

const gatewayMiddleware = read("server/src/gateway/middleware.ts");
const gatewayReadme = read("server/src/gateway/README.md");
assert(gatewayMiddleware.includes("isVerifiedInternalGatewayRequest"), "Gateway internal dispatch must use the process-only token.");
assert(!gatewayMiddleware.includes('headers["x-gateway-internal"] === "1"'), "Gateway must not trust x-gateway-internal by itself.");
if (gatewayReadme) {
  assert(gatewayReadme.includes("transport hardening layer only"), "Gateway boundary doc must state that Gateway is not authorization.");
  assert(
    gatewayReadme.includes("authenticate") && gatewayReadme.includes("requireSuperAdmin") && gatewayReadme.includes("canAccessDocument"),
    "Gateway boundary doc must list required server-side guards."
  );
}

const docsService = read("server/src/modules/docs/docs.service.ts");
assert(!docsService.includes("normalizeLegacyDraftStatuses"), "Draft status must not be silently published.");
assert(docsService.includes("DOC_REVISION_CONFLICT"), "Document updates must enforce optimistic revision checks.");
const docsRepo = read("server/src/modules/docs/docs.repo.ts");
assert(docsRepo.includes("MATCH(") && docsRepo.includes("AGAINST"), "MySQL document search must use the full-text index path.");

const mysqlDdl = read("server/src/db/mysql-ddl.ts");
assert(mysqlDdl.includes("MYSQL_FULLTEXT_INDEXES") && mysqlDdl.includes("docs_search_fulltext_idx"), "MySQL document search full-text index must stay declared.");

const settingsRoutes = read("server/src/modules/settings/settings.routes.ts");
assert(settingsRoutes.includes("requireSuperAdmin"), "System and user-management routes must require super admin.");

// ============= 4. 大文件检查（保留） =============

console.log("[ARCH] 检查大文件...");

const MAX_LINES = 250;
const checkDirs = [
  resolve(root, "apps/admin/src"),
];

for (const dir of checkDirs) {
  const files = findFiles(dir, [".ts", ".vue", ".css", ".js"]);
  for (const file of files) {
    const content = read(file);
    const lines = content.split("\n").length;
    if (lines > MAX_LINES) {
      const relPath = relative(root, file);
      warn(false, `[大文件] ${relPath} 有 ${lines} 行，超过 ${MAX_LINES} 行限制`);
    }
  }
}

// ============= 输出结果 =============

console.log("");
if (failures.length > 0) {
  console.log(`❌ [ARCH] 发现 ${failures.length} 个架构违规:`);
  failures.forEach((msg) => console.log(`   - ${msg}`));
}

if (warnings.length > 0) {
  console.log(`⚠️  [ARCH] 发现 ${warnings.length} 个建议:`);
  warnings.forEach((msg) => console.log(`   - ${msg}`));
}

if (failures.length === 0) {
  console.log("✅ [ARCH] 架构边界检查通过");
  if (warnings.length > 0) {
    console.log(`   (含 ${warnings.length} 个建议项，可忽略或逐步修复)`);
  }
}

process.exit(failures.length > 0 ? 1 : 0);
