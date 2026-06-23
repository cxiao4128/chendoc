import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const versions = ["package.json", "apps/admin/package.json", "server/package.json"].map((path) => JSON.parse(read(path)).version);
assert(new Set(versions).size === 1, `Workspace versions differ: ${versions.join(", ")}`);
const releaseVersion = versions[0];
assert(read("apps/admin/src/pages/settings/SettingsPage.vue").includes(`APP_VERSION = "v${releaseVersion}"`), "Frontend displayed version differs from package version.");
assert(read("server/src/modules/settings/settings.service.ts").includes(`APP_VERSION = "${releaseVersion}"`), "Backend displayed version differs from package version.");

const gatewayMiddleware = read("server/src/gateway/middleware.ts");
const gatewayReadme = read("server/src/gateway/README.md");
assert(gatewayMiddleware.includes("isVerifiedInternalGatewayRequest"), "Gateway internal dispatch must use the process-only token.");
assert(!gatewayMiddleware.includes('headers["x-gateway-internal"] === "1"'), "Gateway must not trust x-gateway-internal by itself.");
assert(gatewayReadme.includes("transport hardening layer only"), "Gateway boundary doc must state that Gateway is not authorization.");
assert(gatewayReadme.includes("authenticate") && gatewayReadme.includes("requireSuperAdmin") && gatewayReadme.includes("canAccessDocument"), "Gateway boundary doc must list required server-side guards.");

const docsService = read("server/src/modules/docs/docs.service.ts");
assert(!docsService.includes("normalizeLegacyDraftStatuses"), "Draft status must not be silently published.");
assert(docsService.includes("DOC_REVISION_CONFLICT"), "Document updates must enforce optimistic revision checks.");
assert(docsService.includes("MATCH(") && docsService.includes("AGAINST"), "MySQL document search must use the full-text index path.");

const mysqlDdl = read("server/src/db/mysql-ddl.ts");
assert(mysqlDdl.includes("MYSQL_FULLTEXT_INDEXES") && mysqlDdl.includes("docs_search_fulltext_idx"), "MySQL document search full-text index must stay declared.");

const settingsRoutes = read("server/src/modules/settings/settings.routes.ts");
assert(settingsRoutes.includes("requireSuperAdmin"), "System and user-management routes must require super admin.");

if (failures.length) {
  failures.forEach((message) => console.error(`[ARCH] ${message}`));
  process.exit(1);
}
console.log("Architecture contract passed.");
