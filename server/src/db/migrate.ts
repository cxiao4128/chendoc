import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, databaseProvider, mysqlPool, sqlite } from "./client.js";
import { MYSQL_CREATE_TABLES, MYSQL_INDEXES } from "./mysql-ddl.js";

function migrateSqlite() {
  if (!sqlite) throw new Error("SQLite connection is not available.");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'unused',
      created_by INTEGER REFERENCES users(id),
      used_by INTEGER REFERENCES users(id),
      used_at INTEGER,
      expire_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS captchas (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      try_count INTEGER NOT NULL DEFAULT 0,
      expire_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crypto_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      private_key_encrypted TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      expire_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      key_encrypted TEXT NOT NULL,
      expire_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      owner_id INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER REFERENCES spaces(id),
      parent_id INTEGER,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL DEFAULT '{}',
      content_html TEXT NOT NULL DEFAULT '',
      cover_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sort INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL REFERENCES docs(id),
      share_code INTEGER NOT NULL UNIQUE,
      custom_slug TEXT UNIQUE,
      password_hash TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      review_status TEXT NOT NULL DEFAULT 'approved',
      review_note TEXT,
      review_content_hash TEXT,
      requested_by INTEGER REFERENCES users(id),
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at INTEGER,
      expire_at INTEGER,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      doc_id INTEGER REFERENCES docs(id),
      object_key TEXT NOT NULL UNIQUE,
      public_url TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      kind TEXT NOT NULL,
      original_name TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doc_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL REFERENCES docs(id),
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      content_html TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'string',
      encrypted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS docs_parent_idx ON docs(parent_id);
    CREATE INDEX IF NOT EXISTS docs_deleted_idx ON docs(deleted_at);
    CREATE INDEX IF NOT EXISTS docs_space_idx ON docs(space_id);
    CREATE INDEX IF NOT EXISTS docs_updated_idx ON docs(updated_at);
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expire_idx ON auth_sessions(expire_at);
    CREATE INDEX IF NOT EXISTS shares_doc_idx ON shares(doc_id);
    CREATE INDEX IF NOT EXISTS doc_versions_doc_created_idx ON doc_versions(doc_id, created_at);
    CREATE INDEX IF NOT EXISTS operation_logs_target_idx ON operation_logs(target_type, target_id);
    CREATE INDEX IF NOT EXISTS operation_logs_user_idx ON operation_logs(user_id);
  `);

  const docColumns = sqlite.prepare("PRAGMA table_info(docs)").all() as Array<{ name: string }>;
  const hasColumn = (name: string) => docColumns.some((column) => column.name === name);
  if (!hasColumn("summary")) sqlite.exec("ALTER TABLE docs ADD COLUMN summary TEXT");
  if (!hasColumn("tags")) sqlite.exec("ALTER TABLE docs ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  if (!hasColumn("pinned")) sqlite.exec("ALTER TABLE docs ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  sqlite.exec("CREATE INDEX IF NOT EXISTS docs_pinned_idx ON docs(pinned)");

  const shareColumns = sqlite.prepare("PRAGMA table_info(shares)").all() as Array<{ name: string }>;
  const hasShareColumn = (name: string) => shareColumns.some((column) => column.name === name);
  if (!hasShareColumn("custom_slug")) sqlite.exec("ALTER TABLE shares ADD COLUMN custom_slug TEXT");
  if (!hasShareColumn("review_status")) sqlite.exec("ALTER TABLE shares ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved'");
  if (!hasShareColumn("review_note")) sqlite.exec("ALTER TABLE shares ADD COLUMN review_note TEXT");
  if (!hasShareColumn("review_content_hash")) sqlite.exec("ALTER TABLE shares ADD COLUMN review_content_hash TEXT");
  if (!hasShareColumn("requested_by")) sqlite.exec("ALTER TABLE shares ADD COLUMN requested_by INTEGER REFERENCES users(id)");
  if (!hasShareColumn("reviewed_by")) sqlite.exec("ALTER TABLE shares ADD COLUMN reviewed_by INTEGER REFERENCES users(id)");
  if (!hasShareColumn("reviewed_at")) sqlite.exec("ALTER TABLE shares ADD COLUMN reviewed_at INTEGER");
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS shares_custom_slug_unique ON shares(custom_slug)");
}

async function migrateMysql() {
  if (!mysqlPool) throw new Error("MySQL connection is not available.");
  for (const statement of MYSQL_CREATE_TABLES) {
    await mysqlPool.query(statement);
  }

  const [databaseRows] = await mysqlPool.query("SELECT DATABASE() AS databaseName");
  const databaseName = (databaseRows as Array<{ databaseName: string }>)[0]?.databaseName;
  if (!databaseName) throw new Error("Unable to resolve current MySQL database.");

  for (const index of MYSQL_INDEXES) {
    const [existingRows] = await mysqlPool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
       LIMIT 1`,
      [databaseName, index.table, index.name]
    );
    if ((existingRows as unknown[]).length) continue;
    await mysqlPool.query(`CREATE INDEX \`${index.name}\` ON \`${index.table}\` (${index.columns})`);
  }
}

export async function migrate() {
  if (databaseProvider === "mysql") {
    await migrateMysql();
    return;
  }
  migrateSqlite();
}

function isDirectExecution() {
  const entry = process.argv[1];
  return entry ? resolve(entry) === resolve(fileURLToPath(import.meta.url)) : false;
}

if (isDirectExecution()) {
  try {
    await migrate();
    console.log(`Database migration completed for ${databaseProvider}.`);
  } finally {
    await closeDatabase();
  }
}
