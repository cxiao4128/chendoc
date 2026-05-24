import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import mysql from "mysql2/promise";
import { MYSQL_CREATE_TABLES, MYSQL_TABLE_NAMES } from "../src/db/mysql-ddl.js";

type CliArgs = {
  force: boolean;
  help: boolean;
  sqlite?: string;
  mysql?: string;
};

type TablePlan = {
  name: typeof MYSQL_TABLE_NAMES[number];
  columns: string[];
  dateColumns?: string[];
  booleanColumns?: string[];
  defaults?: Record<string, unknown>;
};

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, "..");
const projectRoot = resolve(serverDir, "..");

const tablePlans: TablePlan[] = [
  {
    name: "users",
    columns: ["id", "username", "password_hash", "role", "status", "created_at", "updated_at"],
    dateColumns: ["created_at", "updated_at"],
    defaults: { role: "user", status: "active" }
  },
  {
    name: "spaces",
    columns: ["id", "name", "description", "owner_id", "created_at", "updated_at"],
    dateColumns: ["created_at", "updated_at"]
  },
  {
    name: "invites",
    columns: ["id", "code", "status", "created_by", "used_by", "used_at", "expire_at", "created_at", "updated_at"],
    dateColumns: ["used_at", "expire_at", "created_at", "updated_at"],
    defaults: { status: "unused" }
  },
  {
    name: "captchas",
    columns: ["id", "code_hash", "try_count", "expire_at", "used_at", "created_at"],
    dateColumns: ["expire_at", "used_at", "created_at"],
    defaults: { try_count: 0 }
  },
  {
    name: "crypto_keys",
    columns: ["id", "key_id", "public_key", "private_key_encrypted", "status", "expire_at", "created_at"],
    dateColumns: ["expire_at", "created_at"],
    defaults: { status: "active" }
  },
  {
    name: "auth_sessions",
    columns: ["id", "user_id", "key_encrypted", "expire_at", "created_at"],
    dateColumns: ["expire_at", "created_at"]
  },
  {
    name: "docs",
    columns: [
      "id", "space_id", "parent_id", "title", "content_json", "content_html", "cover_url", "summary", "tags",
      "pinned", "status", "sort", "created_by", "updated_by", "deleted_at", "created_at", "updated_at"
    ],
    dateColumns: ["deleted_at", "created_at", "updated_at"],
    booleanColumns: ["pinned"],
    defaults: { content_json: "{}", content_html: "", tags: "[]", pinned: 0, status: "published", sort: 0 }
  },
  {
    name: "shares",
    columns: [
      "id", "doc_id", "share_code", "custom_slug", "password_hash", "is_enabled", "review_status", "review_note",
      "review_content_hash", "requested_by", "reviewed_by", "reviewed_at", "expire_at", "view_count", "created_at", "updated_at"
    ],
    dateColumns: ["reviewed_at", "expire_at", "created_at", "updated_at"],
    booleanColumns: ["is_enabled"],
    defaults: { is_enabled: 1, review_status: "approved", view_count: 0 }
  },
  {
    name: "uploads",
    columns: ["id", "user_id", "doc_id", "object_key", "public_url", "mime_type", "file_size", "kind", "original_name", "created_at"],
    dateColumns: ["created_at"]
  },
  {
    name: "doc_versions",
    columns: ["id", "doc_id", "title", "content_json", "content_html", "created_by", "created_at"],
    dateColumns: ["created_at"]
  },
  {
    name: "settings",
    columns: ["id", "key", "value", "type", "encrypted", "created_at", "updated_at"],
    dateColumns: ["created_at", "updated_at"],
    booleanColumns: ["encrypted"],
    defaults: { type: "string", encrypted: 0 }
  },
  {
    name: "operation_logs",
    columns: ["id", "user_id", "action", "target_type", "target_id", "ip", "user_agent", "created_at"],
    dateColumns: ["created_at"]
  }
];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { force: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--force") args.force = true;
    else if (arg.startsWith("--sqlite=")) args.sqlite = arg.slice("--sqlite=".length);
    else if (arg === "--sqlite") args.sqlite = argv[++i];
    else if (arg.startsWith("--mysql=")) args.mysql = arg.slice("--mysql=".length);
    else if (arg === "--mysql") args.mysql = argv[++i];
  }
  return args;
}

function readEnvFile(path: string) {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  const content = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    env[match[1]!] = value;
  }
  return env;
}

function resolveFromRoot(path: string) {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

function sqlitePathFromUrl(value: string) {
  const path = value.startsWith("file:") ? value.slice("file:".length) : value;
  return resolveFromRoot(path || "./data/chendoc.sqlite");
}

function timestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function quoteSqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function qi(value: string) {
  return `\`${value.replaceAll("`", "``")}\``;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

async function backupSqlite(sourcePath: string) {
  if (!existsSync(sourcePath)) {
    throw new Error(`SQLite database not found: ${sourcePath}`);
  }

  const backupDir = resolve(projectRoot, "backups/db");
  const backupPath = resolve(backupDir, `chendoc-sqlite-before-mysql-${timestamp()}.sqlite`);
  const tempPath = `${backupPath}.tmp-${process.pid}`;
  mkdirSync(backupDir, { recursive: true });

  let sourceDb: Database.Database | undefined;
  let backupDb: Database.Database | undefined;
  try {
    sourceDb = new Database(sourcePath, { fileMustExist: true });
    sourceDb.pragma("busy_timeout = 5000");
    sourceDb.exec(`VACUUM INTO ${quoteSqlString(tempPath)}`);
    sourceDb.close();
    sourceDb = undefined;

    backupDb = new Database(tempPath, { readonly: true, fileMustExist: true });
    const integrity = backupDb.prepare("PRAGMA integrity_check").pluck().get();
    backupDb.close();
    backupDb = undefined;
    if (integrity !== "ok") throw new Error(`Backup integrity check failed: ${integrity}`);

    renameSync(tempPath, backupPath);
    console.log(`SQLite backup completed: ${backupPath} (${formatBytes(statSync(backupPath).size)})`);
    return backupPath;
  } catch (error) {
    if (sourceDb) sourceDb.close();
    if (backupDb) backupDb.close();
    if (existsSync(tempPath)) rmSync(tempPath, { force: true });
    throw error;
  }
}

function tableExists(sqlite: Database.Database, table: string) {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return !!row;
}

function sqliteColumns(sqlite: Database.Database, table: string) {
  if (!tableExists(sqlite, table)) return new Set<string>();
  return new Set((sqlite.prepare(`PRAGMA table_info(${qi(table)})`).all() as Array<{ name: string }>).map((column) => column.name));
}

function toMysqlDate(value: unknown, table: string, column: string) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  const numeric = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value in ${table}.${column}: ${String(value)}`);
  }
  return date;
}

function normalizeValue(plan: TablePlan, column: string, value: unknown) {
  if (plan.dateColumns?.includes(column)) return toMysqlDate(value, plan.name, column);
  if (plan.booleanColumns?.includes(column)) return value ? 1 : 0;
  if ((column === "content_json" || column === "tags") && value !== null && value !== undefined && typeof value !== "string") {
    return JSON.stringify(value);
  }
  return value;
}

function readRows(sqlite: Database.Database, plan: TablePlan) {
  const existingColumns = sqliteColumns(sqlite, plan.name);
  if (!existingColumns.size) return [];
  const selectColumns = plan.columns.filter((column) => existingColumns.has(column));
  const rows = sqlite.prepare(`SELECT ${selectColumns.map(qi).join(", ")} FROM ${qi(plan.name)} ORDER BY ${existingColumns.has("id") ? "id" : "rowid"}`).all() as Record<string, unknown>[];
  return rows.map((row) => plan.columns.map((column) => {
    const value = Object.prototype.hasOwnProperty.call(row, column) ? row[column] : plan.defaults?.[column] ?? null;
    return normalizeValue(plan, column, value);
  }));
}

async function createMysqlSchema(connection: mysql.PoolConnection) {
  for (const statement of MYSQL_CREATE_TABLES) {
    await connection.query(statement);
  }
}

async function mysqlCount(connection: mysql.PoolConnection, table: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS count FROM ${qi(table)}`);
  return Number(rows[0]?.count ?? 0);
}

function sqliteCount(sqlite: Database.Database, table: string) {
  if (!tableExists(sqlite, table)) return 0;
  const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${qi(table)}`).get() as { count: number };
  return Number(row.count);
}

async function assertMysqlEmpty(connection: mysql.PoolConnection, force: boolean) {
  if (force) {
    console.warn("WARNING: --force enabled.");
    console.warn("WARNING: existing rows in MySQL target tables may be cleared before migration.");
    console.warn("WARNING: SQLite source and its backup will not be deleted or modified.");
  }

  const existing = [];
  for (const table of MYSQL_TABLE_NAMES) {
    const count = await mysqlCount(connection, table);
    if (count > 0) existing.push({ table, count });
  }
  if (!existing.length) return;
  if (!force) {
    console.error("MySQL target already has data. Migration refused by default.");
    for (const item of existing) console.error(`- ${item.table}: ${item.count}`);
    console.error("Use --force only when you intentionally want to clear MySQL target tables and retry.");
    process.exit(1);
  }
  console.warn("WARNING: MySQL target tables with existing rows will be cleared before migration.");
}

async function clearMysqlTables(connection: mysql.PoolConnection) {
  for (const table of [...MYSQL_TABLE_NAMES].reverse()) {
    await connection.query(`DELETE FROM ${qi(table)}`);
  }
}

async function insertRows(connection: mysql.PoolConnection, plan: TablePlan, rows: unknown[][]) {
  if (!rows.length) {
    console.log(`${plan.name}: migrated 0 rows`);
    return;
  }
  const columnsSql = plan.columns.map(qi).join(", ");
  for (let index = 0; index < rows.length; index += 200) {
    const chunk = rows.slice(index, index + 200);
    await connection.query(`INSERT INTO ${qi(plan.name)} (${columnsSql}) VALUES ?`, [chunk]);
  }
  console.log(`${plan.name}: migrated ${rows.length} rows`);
}

async function validateAdmin(connection: mysql.PoolConnection, sqlite: Database.Database, defaultAdminUsername: string) {
  const sqliteAdmin = tableExists(sqlite, "users")
    ? sqlite.prepare("SELECT id, username, role, status FROM users WHERE lower(username) = lower(?) LIMIT 1").get(defaultAdminUsername) as { role?: string } | undefined
    : undefined;
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT id, username, role, status FROM users WHERE lower(username) = lower(?) LIMIT 1",
    [defaultAdminUsername]
  );
  const mysqlAdmin = rows[0] as { role?: string } | undefined;
  const adminOk = !!sqliteAdmin && !!mysqlAdmin;
  const roleOk = sqliteAdmin?.role === "admin" && mysqlAdmin?.role === "admin";
  console.log(`admin: sqlite=${sqliteAdmin ? "present" : "missing"} mysql=${mysqlAdmin ? "present" : "missing"} ${adminOk ? "OK" : "FAIL"}`);
  console.log(`super_admin_role: sqlite=${sqliteAdmin?.role ?? "missing"} mysql=${mysqlAdmin?.role ?? "missing"} ${roleOk ? "OK" : "FAIL"}`);

  const failures: string[] = [];
  if (!sqliteAdmin) failures.push("admin source account missing in SQLite");
  if (!mysqlAdmin) failures.push("admin account missing in MySQL");
  if (!roleOk) failures.push("super admin role was not preserved");
  return failures;
}

async function validateShareIdentifiers(connection: mysql.PoolConnection, sqlite: Database.Database) {
  const sqliteRows = tableExists(sqlite, "shares")
    ? sqlite.prepare("SELECT id, doc_id, share_code, custom_slug FROM shares ORDER BY id").all()
    : [];
  const [mysqlRows] = await connection.query<mysql.RowDataPacket[]>("SELECT id, doc_id, share_code, custom_slug FROM shares ORDER BY id");
  const ok = JSON.stringify(sqliteRows) === JSON.stringify(mysqlRows);
  console.log(`share_identifiers: sqlite=${sqliteRows.length} mysql=${mysqlRows.length} ${ok ? "OK" : "FAIL"}`);
  return ok ? [] : ["share id/share_code/custom_slug values changed"];
}

function normalizeReviewRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: row.id,
    review_status: row.review_status,
    review_note: row.review_note,
    review_content_hash: row.review_content_hash,
    requested_by: row.requested_by,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at instanceof Date
      ? row.reviewed_at.getTime()
      : row.reviewed_at === null || row.reviewed_at === undefined
        ? null
        : new Date(row.reviewed_at as string | number).getTime()
  }));
}

async function validateShareReviews(connection: mysql.PoolConnection, sqlite: Database.Database) {
  const sqliteRows = tableExists(sqlite, "shares")
    ? sqlite.prepare("SELECT id, review_status, review_note, review_content_hash, requested_by, reviewed_by, reviewed_at FROM shares ORDER BY id").all() as Array<Record<string, unknown>>
    : [];
  const [mysqlRows] = await connection.query<mysql.RowDataPacket[]>("SELECT id, review_status, review_note, review_content_hash, requested_by, reviewed_by, reviewed_at FROM shares ORDER BY id");
  const ok = JSON.stringify(normalizeReviewRows(sqliteRows)) === JSON.stringify(normalizeReviewRows(mysqlRows));
  console.log(`share_reviews: sqlite=${sqliteRows.length} mysql=${mysqlRows.length} ${ok ? "OK" : "FAIL"}`);
  return ok ? [] : ["share review metadata changed"];
}

async function validateDeletedDocs(connection: mysql.PoolConnection, sqlite: Database.Database) {
  const sqliteDeleted = tableExists(sqlite, "docs")
    ? Number((sqlite.prepare("SELECT COUNT(*) AS count FROM docs WHERE deleted_at IS NOT NULL").get() as { count: number }).count)
    : 0;
  const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS count FROM docs WHERE deleted_at IS NOT NULL");
  const mysqlDeleted = Number(rows[0]?.count ?? 0);
  console.log(`trash: sqlite=${sqliteDeleted} mysql=${mysqlDeleted} ${sqliteDeleted === mysqlDeleted ? "OK" : "FAIL"}`);
  return sqliteDeleted === mysqlDeleted ? [] : [`deleted/trash docs mismatch: sqlite=${sqliteDeleted} mysql=${mysqlDeleted}`];
}

async function validateMigration(connection: mysql.PoolConnection, sqlite: Database.Database, defaultAdminUsername: string) {
  const failures: string[] = [];
  for (const plan of tablePlans) {
    const sqliteTotal = sqliteCount(sqlite, plan.name);
    const mysqlTotal = await mysqlCount(connection, plan.name);
    const ok = sqliteTotal === mysqlTotal;
    console.log(`${plan.name}: sqlite=${sqliteTotal} mysql=${mysqlTotal} ${ok ? "OK" : "FAIL"}`);
    if (!ok) failures.push(`${plan.name} count mismatch`);
  }

  failures.push(...await validateAdmin(connection, sqlite, defaultAdminUsername));
  failures.push(...await validateDeletedDocs(connection, sqlite));
  failures.push(...await validateShareIdentifiers(connection, sqlite));
  failures.push(...await validateShareReviews(connection, sqlite));
  return failures;
}

function printNextSteps(mysqlUrl: string, backupPath: string) {
  console.log("");
  console.log("Migration validation passed.");
  console.log(`SQLite backup path: ${backupPath}`);
  console.log("SQLite source was not deleted or modified.");
  console.log("");
  console.log("Next steps:");
  console.log("1. Confirm every validation line is OK.");
  console.log("2. Manually edit .env:");
  console.log("   DATABASE_PROVIDER=mysql");
  console.log(`   DATABASE_URL=${mysqlUrl}`);
  console.log("3. Run:");
  console.log("   bash ./deploy.sh");
  console.log("4. Log in to the admin console and verify users, docs, shares, settings, trash, and permissions.");
  console.log("5. Keep the SQLite backup until MySQL has been verified in production.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  npm run migrate:sqlite-to-mysql -- --mysql mysql://user:password@127.0.0.1:3306/chendoc
  npm run migrate:sqlite-to-mysql -- --sqlite ./data/chendoc.sqlite --mysql mysql://user:password@127.0.0.1:3306/chendoc
  npm run migrate:sqlite-to-mysql -- --mysql mysql://user:password@127.0.0.1:3306/chendoc --force

Environment fallback:
  SQLITE_DATABASE_URL=file:./data/chendoc.sqlite
  MYSQL_DATABASE_URL=mysql://user:password@127.0.0.1:3306/chendoc`);
    return;
  }

  const env = {
    ...readEnvFile(resolve(projectRoot, ".env")),
    ...readEnvFile(resolve(serverDir, ".env")),
    ...process.env
  };
  const provider = String(env.DATABASE_PROVIDER || "sqlite").toLowerCase();
  const sqliteSource = args.sqlite || env.SQLITE_DATABASE_URL || (provider === "sqlite" ? env.DATABASE_URL : undefined) || "file:./data/chendoc.sqlite";
  const mysqlUrl = args.mysql || env.MYSQL_DATABASE_URL || (provider === "mysql" ? env.DATABASE_URL : "");
  if (!mysqlUrl || !/^mysql:\/\//i.test(mysqlUrl)) {
    throw new Error("Target MySQL URL is required. Use --mysql mysql://user:password@127.0.0.1:3306/chendoc or MYSQL_DATABASE_URL.");
  }

  const sqlitePath = sqlitePathFromUrl(String(sqliteSource));
  console.log(`SQLite source: ${sqlitePath}`);
  console.log("SQLite will not be deleted or overwritten.");
  const backupPath = await backupSqlite(sqlitePath);

  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const pool = mysql.createPool({ uri: mysqlUrl, connectionLimit: 4, waitForConnections: true, charset: "utf8mb4" });
  const connection = await pool.getConnection();

  try {
    await createMysqlSchema(connection);
    await assertMysqlEmpty(connection, args.force);

    await connection.beginTransaction();
    try {
      if (args.force) await clearMysqlTables(connection);
      for (const plan of tablePlans) {
        try {
          await insertRows(connection, plan, readRows(sqlite, plan));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Migration failed while processing table "${plan.name}": ${message}`);
        }
      }

      const failures = await validateMigration(connection, sqlite, String(env.DEFAULT_ADMIN_USERNAME || "xchen"));
      if (failures.length) {
        console.error("Migration validation failed:");
        for (const failure of failures) console.error(`- ${failure}`);
        throw new Error("Migration failed validation. MySQL transaction was rolled back.");
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    printNextSteps(mysqlUrl, backupPath);
  } finally {
    sqlite.close();
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
