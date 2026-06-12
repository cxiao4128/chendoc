import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, databaseProvider, mysqlPool, sqlite } from "./client.js";
import { MYSQL_QUERY_INDEXES, SQLITE_QUERY_INDEX_STATEMENTS } from "./migrations/20260613_add_query_indexes.js";
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
      last_seen_at INTEGER NOT NULL,
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
      share_token TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS login_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'user',
      dimension TEXT NOT NULL,
      dimension_value TEXT NOT NULL,
      fail_count INTEGER NOT NULL DEFAULT 0,
      first_failed_at INTEGER NOT NULL,
      last_failed_at INTEGER NOT NULL,
      locked_until INTEGER
    );

    CREATE TABLE IF NOT EXISTS danger_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      session_id TEXT NOT NULL,
      verified_at INTEGER NOT NULL,
      expire_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      username TEXT,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      risk_level TEXT NOT NULL DEFAULT 'low',
      detail TEXT,
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
    CREATE UNIQUE INDEX IF NOT EXISTS login_failures_dimension_unique ON login_failures(username, scope, dimension, dimension_value);
    CREATE INDEX IF NOT EXISTS login_failures_lookup_idx ON login_failures(username, scope, dimension);
    CREATE INDEX IF NOT EXISTS login_failures_last_failed_idx ON login_failures(last_failed_at);
    CREATE INDEX IF NOT EXISTS login_failures_locked_idx ON login_failures(locked_until);
    CREATE UNIQUE INDEX IF NOT EXISTS danger_verifications_session_unique ON danger_verifications(session_id);
    CREATE INDEX IF NOT EXISTS danger_verifications_user_idx ON danger_verifications(user_id);
    CREATE INDEX IF NOT EXISTS danger_verifications_expire_idx ON danger_verifications(expire_at);
    CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at);
  `);
  for (const statement of SQLITE_QUERY_INDEX_STATEMENTS) {
    sqlite.exec(statement);
  }

  const userColumns = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasUserColumn = (name: string) => userColumns.some((column) => column.name === name);
  if (!hasUserColumn("totp_enabled")) sqlite.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0");
  if (!hasUserColumn("totp_secret_encrypted")) sqlite.exec("ALTER TABLE users ADD COLUMN totp_secret_encrypted TEXT");
  if (!hasUserColumn("totp_recovery_codes_encrypted")) sqlite.exec("ALTER TABLE users ADD COLUMN totp_recovery_codes_encrypted TEXT");
  if (!hasUserColumn("totp_updated_at")) sqlite.exec("ALTER TABLE users ADD COLUMN totp_updated_at INTEGER");

  const docColumns = sqlite.prepare("PRAGMA table_info(docs)").all() as Array<{ name: string }>;
  const hasColumn = (name: string) => docColumns.some((column) => column.name === name);
  if (!hasColumn("summary")) sqlite.exec("ALTER TABLE docs ADD COLUMN summary TEXT");
  if (!hasColumn("tags")) sqlite.exec("ALTER TABLE docs ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  if (!hasColumn("pinned")) sqlite.exec("ALTER TABLE docs ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  if (!hasColumn("content_json_ciphertext")) sqlite.exec("ALTER TABLE docs ADD COLUMN content_json_ciphertext TEXT");
  if (!hasColumn("content_json_iv")) sqlite.exec("ALTER TABLE docs ADD COLUMN content_json_iv TEXT");
  if (!hasColumn("content_json_tag")) sqlite.exec("ALTER TABLE docs ADD COLUMN content_json_tag TEXT");
  if (!hasColumn("content_json_key_version")) sqlite.exec("ALTER TABLE docs ADD COLUMN content_json_key_version TEXT");
  if (!hasColumn("content_html_ciphertext")) sqlite.exec("ALTER TABLE docs ADD COLUMN content_html_ciphertext TEXT");
  if (!hasColumn("content_html_iv")) sqlite.exec("ALTER TABLE docs ADD COLUMN content_html_iv TEXT");
  if (!hasColumn("content_html_tag")) sqlite.exec("ALTER TABLE docs ADD COLUMN content_html_tag TEXT");
  if (!hasColumn("content_html_key_version")) sqlite.exec("ALTER TABLE docs ADD COLUMN content_html_key_version TEXT");
  sqlite.exec("CREATE INDEX IF NOT EXISTS docs_pinned_idx ON docs(pinned)");

  const docVersionColumns = sqlite.prepare("PRAGMA table_info(doc_versions)").all() as Array<{ name: string }>;
  const hasDocVersionColumn = (name: string) => docVersionColumns.some((column) => column.name === name);
  if (!hasDocVersionColumn("content_json_ciphertext")) sqlite.exec("ALTER TABLE doc_versions ADD COLUMN content_json_ciphertext TEXT");
  if (!hasDocVersionColumn("content_json_iv")) sqlite.exec("ALTER TABLE doc_versions ADD COLUMN content_json_iv TEXT");
  if (!hasDocVersionColumn("content_json_tag")) sqlite.exec("ALTER TABLE doc_versions ADD COLUMN content_json_tag TEXT");
  if (!hasDocVersionColumn("content_json_key_version")) sqlite.exec("ALTER TABLE doc_versions ADD COLUMN content_json_key_version TEXT");
  if (!hasDocVersionColumn("content_html_ciphertext")) sqlite.exec("ALTER TABLE doc_versions ADD COLUMN content_html_ciphertext TEXT");
  if (!hasDocVersionColumn("content_html_iv")) sqlite.exec("ALTER TABLE doc_versions ADD COLUMN content_html_iv TEXT");
  if (!hasDocVersionColumn("content_html_tag")) sqlite.exec("ALTER TABLE doc_versions ADD COLUMN content_html_tag TEXT");
  if (!hasDocVersionColumn("content_html_key_version")) sqlite.exec("ALTER TABLE doc_versions ADD COLUMN content_html_key_version TEXT");

  const authSessionColumns = sqlite.prepare("PRAGMA table_info(auth_sessions)").all() as Array<{ name: string }>;
  const hasAuthSessionColumn = (name: string) => authSessionColumns.some((column) => column.name === name);
  if (!hasAuthSessionColumn("last_seen_at")) {
    sqlite.exec("ALTER TABLE auth_sessions ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0");
    sqlite.exec("UPDATE auth_sessions SET last_seen_at = created_at WHERE last_seen_at = 0");
  }

  const shareColumns = sqlite.prepare("PRAGMA table_info(shares)").all() as Array<{ name: string }>;
  const hasShareColumn = (name: string) => shareColumns.some((column) => column.name === name);
  if (!hasShareColumn("custom_slug")) sqlite.exec("ALTER TABLE shares ADD COLUMN custom_slug TEXT");
  if (!hasShareColumn("share_token")) {
    sqlite.exec("ALTER TABLE shares ADD COLUMN share_token TEXT");
    sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS shares_share_token_unique ON shares(share_token)");
  }
  sqlite.exec("UPDATE shares SET share_token = 'legacy-' || id WHERE share_token IS NOT NULL AND share_token != ''");
  sqlite.exec("UPDATE shares SET share_token = CAST(share_code AS TEXT)");
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

  await addMysqlColumnIfMissing(databaseName, "users", "totp_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
  await addMysqlColumnIfMissing(databaseName, "users", "totp_secret_encrypted", "TEXT NULL");
  await addMysqlColumnIfMissing(databaseName, "users", "totp_recovery_codes_encrypted", "MEDIUMTEXT NULL");
  await addMysqlColumnIfMissing(databaseName, "users", "totp_updated_at", "DATETIME(3) NULL");
  for (const tableName of ["docs", "doc_versions"]) {
    await addMysqlColumnIfMissing(databaseName, tableName, "content_json_ciphertext", "MEDIUMTEXT NULL");
    await addMysqlColumnIfMissing(databaseName, tableName, "content_json_iv", "VARCHAR(64) NULL");
    await addMysqlColumnIfMissing(databaseName, tableName, "content_json_tag", "VARCHAR(64) NULL");
    await addMysqlColumnIfMissing(databaseName, tableName, "content_json_key_version", "VARCHAR(32) NULL");
    await addMysqlColumnIfMissing(databaseName, tableName, "content_html_ciphertext", "MEDIUMTEXT NULL");
    await addMysqlColumnIfMissing(databaseName, tableName, "content_html_iv", "VARCHAR(64) NULL");
    await addMysqlColumnIfMissing(databaseName, tableName, "content_html_tag", "VARCHAR(64) NULL");
    await addMysqlColumnIfMissing(databaseName, tableName, "content_html_key_version", "VARCHAR(32) NULL");
  }
  await addMysqlColumnIfMissing(databaseName, "auth_sessions", "last_seen_at", "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
  await mysqlPool.query("UPDATE auth_sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL");
  await addMysqlColumnIfMissing(databaseName, "shares", "share_token", "VARCHAR(64) NULL");
  await mysqlPool.query("UPDATE shares SET share_token = CONCAT('legacy-', id) WHERE share_token IS NOT NULL AND share_token != ''");
  await mysqlPool.query("UPDATE shares SET share_token = CAST(share_code AS CHAR)");
  await mysqlPool.query("ALTER TABLE shares MODIFY COLUMN share_token VARCHAR(64) NOT NULL");
  await addMysqlUniqueIndexIfMissing(databaseName, "shares", "shares_share_token_unique", "`share_token`");

  await addMysqlIndexesIfMissing(databaseName, MYSQL_INDEXES);
  await addMysqlIndexesIfMissing(databaseName, MYSQL_QUERY_INDEXES);
}

async function addMysqlIndexesIfMissing(
  databaseName: string,
  indexes: readonly { table: string; name: string; columns: string }[]
) {
  if (!mysqlPool) throw new Error("MySQL connection is not available.");
  for (const index of indexes) {
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

async function addMysqlColumnIfMissing(databaseName: string, tableName: string, columnName: string, definition: string) {
  if (!mysqlPool) throw new Error("MySQL connection is not available.");
  const [existingRows] = await mysqlPool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [databaseName, tableName, columnName]
  );
  if ((existingRows as unknown[]).length) return;
  await mysqlPool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function addMysqlUniqueIndexIfMissing(databaseName: string, tableName: string, indexName: string, columns: string) {
  if (!mysqlPool) throw new Error("MySQL connection is not available.");
  const [existingRows] = await mysqlPool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [databaseName, tableName, indexName]
  );
  if ((existingRows as unknown[]).length) return;
  await mysqlPool.query(`CREATE UNIQUE INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`);
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
