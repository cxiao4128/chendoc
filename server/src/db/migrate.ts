import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { closeDatabase, databaseProvider, mysqlPool, sqlite } from "./client.js";
import { MYSQL_QUERY_INDEXES, SQLITE_QUERY_INDEX_STATEMENTS } from "./migrations/20260613_add_query_indexes.js";
import { MYSQL_CREATE_TABLES, MYSQL_FULLTEXT_INDEXES, MYSQL_INDEXES } from "./mysql-ddl.js";
import { generateDocUid } from "../utils/docUid.js";
import { generateShareToken, isWeakShareToken } from "../utils/shareToken.js";

type DocIdentityMigrationStats = {
  total: number;
  generatedDocUid: number;
  existingDocUid: number;
  orphanDocs: number;
  retryCount: number;
};

function emptyDocIdentityStats(): DocIdentityMigrationStats {
  return {
    total: 0,
    generatedDocUid: 0,
    existingDocUid: 0,
    orphanDocs: 0,
    retryCount: 0
  };
}

function docIdentityForOwner(row: { createdBy: number | null; username: string | null; role: string | null }) {
  if (!row.createdBy || !row.role) {
    return {
      ownerId: null,
      ownerRole: "super_admin",
      scope: "system",
      isSuperAdminDoc: true,
      visibility: "private",
      orphan: true
    };
  }

  if (row.role === "user") {
    return {
      ownerId: row.createdBy,
      ownerRole: "user",
      scope: "user",
      isSuperAdminDoc: false,
      visibility: "private",
      orphan: false
    };
  }

  const isDefaultSuperAdmin = row.username?.toLowerCase() === env.defaultAdminUsername.toLowerCase();
  return {
    ownerId: row.createdBy,
    ownerRole: isDefaultSuperAdmin ? "super_admin" : "doc_admin",
    scope: "admin",
    isSuperAdminDoc: isDefaultSuperAdmin,
    visibility: "private",
    orphan: false
  };
}

function generateUniqueDocUid(used: Set<string>, stats: DocIdentityMigrationStats) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const docUid = generateDocUid();
    if (!used.has(docUid)) {
      used.add(docUid);
      stats.retryCount += attempt;
      return docUid;
    }
  }
  throw new Error("doc_uid generation failed after 5 retries.");
}

function logDocIdentityStats(stats: DocIdentityMigrationStats) {
  console.log(`Document identity migration: total=${stats.total}, generated_doc_uid=${stats.generatedDocUid}, existing_doc_uid=${stats.existingDocUid}, orphan_docs=${stats.orphanDocs}, retry_count=${stats.retryCount}`);
}

function uniqueShareToken(used: Set<string>) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = generateShareToken();
    if (!used.has(token)) {
      used.add(token);
      return token;
    }
  }
  throw new Error("share_token generation failed after 10 retries.");
}

function backfillSqliteShareTokens() {
  if (!sqlite) throw new Error("SQLite connection is not available.");
  const rows = sqlite.prepare("SELECT id, share_code AS shareCode, share_token AS shareToken FROM shares ORDER BY id ASC").all() as Array<{ id: number; shareCode: number; shareToken: string | null }>;
  const used = new Set(rows.map((row) => row.shareToken).filter((value): value is string => !!value && !isWeakShareToken(value)));
  const update = sqlite.prepare("UPDATE shares SET share_token = ? WHERE id = ?");
  let rotated = 0;
  for (const row of rows) {
    if (!isWeakShareToken(row.shareToken, row.shareCode)) continue;
    update.run(uniqueShareToken(used), row.id);
    rotated += 1;
  }
  if (rotated) console.log(`Share token migration: rotated=${rotated}`);
}

async function backfillMysqlShareTokens() {
  if (!mysqlPool) throw new Error("MySQL connection is not available.");
  const [rawRows] = await mysqlPool.query("SELECT id, share_code AS shareCode, share_token AS shareToken FROM shares ORDER BY id ASC");
  const rows = rawRows as Array<{ id: number; shareCode: number; shareToken: string | null }>;
  const used = new Set(rows.map((row) => row.shareToken).filter((value): value is string => !!value && !isWeakShareToken(value)));
  let rotated = 0;
  for (const row of rows) {
    if (!isWeakShareToken(row.shareToken, row.shareCode)) continue;
    await mysqlPool.query("UPDATE shares SET share_token = ? WHERE id = ?", [uniqueShareToken(used), row.id]);
    rotated += 1;
  }
  if (rotated) console.log(`Share token migration: rotated=${rotated}`);
}

function migrateSqlite() {
  if (!sqlite) throw new Error("SQLite connection is not available.");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      is_super_admin INTEGER NOT NULL DEFAULT 0,
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
      doc_uid TEXT NOT NULL,
      space_id INTEGER REFERENCES spaces(id),
      parent_id INTEGER,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL DEFAULT '{}',
      content_html TEXT NOT NULL DEFAULT '',
      cover_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sort INTEGER NOT NULL DEFAULT 0,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      owner_role TEXT NOT NULL DEFAULT 'user',
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      scope TEXT NOT NULL DEFAULT 'user',
      is_super_admin_doc INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'private',
      tenant_key TEXT NOT NULL DEFAULT 'default',
      deleted_at INTEGER,
      deleted_by INTEGER REFERENCES users(id),
      revision INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
      share_code INTEGER NOT NULL UNIQUE,
      share_token TEXT NOT NULL,
      custom_slug TEXT UNIQUE,
      password_hash TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      review_status TEXT NOT NULL DEFAULT 'approved',
      review_note TEXT,
      review_content_hash TEXT,
      requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at INTEGER,
      expire_at INTEGER,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_uid TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      fields TEXT NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'draft',
      max_submissions INTEGER,
      allow_multiple INTEGER NOT NULL DEFAULT 0,
      exclusive_info TEXT,
      privacy_notice TEXT,
      retention_days INTEGER,
      store_user_agent INTEGER NOT NULL DEFAULT 0,
      view_count INTEGER NOT NULL DEFAULT 0,
      submission_count INTEGER NOT NULL DEFAULT 0,
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
      detached_at INTEGER,
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

    CREATE TABLE IF NOT EXISTS form_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      ip TEXT NOT NULL,
      submitter_id TEXT,
      user_agent TEXT,
      submitted_at INTEGER NOT NULL
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

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_uid TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      role TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      doc_uid TEXT,
      owner_id INTEGER,
      ip TEXT,
      user_agent TEXT,
      path TEXT,
      method TEXT,
      status_code INTEGER,
      message TEXT,
      data TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS docs_parent_idx ON docs(parent_id);
    CREATE INDEX IF NOT EXISTS docs_deleted_idx ON docs(deleted_at);
    CREATE INDEX IF NOT EXISTS docs_space_idx ON docs(space_id);
    CREATE INDEX IF NOT EXISTS docs_updated_idx ON docs(updated_at);
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expire_idx ON auth_sessions(expire_at);
    CREATE INDEX IF NOT EXISTS shares_doc_idx ON shares(doc_id);
    CREATE INDEX IF NOT EXISTS uploads_user_idx ON uploads(user_id);
    CREATE INDEX IF NOT EXISTS uploads_doc_idx ON uploads(doc_id);
    CREATE INDEX IF NOT EXISTS uploads_user_created_idx ON uploads(user_id, created_at);
    CREATE INDEX IF NOT EXISTS uploads_detached_idx ON uploads(detached_at);
    CREATE INDEX IF NOT EXISTS doc_versions_doc_created_idx ON doc_versions(doc_id, created_at);
    CREATE INDEX IF NOT EXISTS forms_owner_idx ON forms(owner_id);
    CREATE INDEX IF NOT EXISTS forms_status_idx ON forms(status);
    CREATE INDEX IF NOT EXISTS form_submissions_form_idx ON form_submissions(form_id);
    CREATE INDEX IF NOT EXISTS form_submissions_ip_idx ON form_submissions(ip);
    CREATE INDEX IF NOT EXISTS form_submissions_time_idx ON form_submissions(submitted_at);
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
    CREATE INDEX IF NOT EXISTS logs_type_created_idx ON logs(type, created_at);
    CREATE INDEX IF NOT EXISTS logs_user_created_idx ON logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS logs_action_created_idx ON logs(action, created_at);
    CREATE INDEX IF NOT EXISTS logs_doc_uid_idx ON logs(doc_uid);
    CREATE INDEX IF NOT EXISTS logs_created_idx ON logs(created_at);
  `);
  for (const statement of SQLITE_QUERY_INDEX_STATEMENTS) {
    sqlite.exec(statement);
  }

  const userColumns = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasUserColumn = (name: string) => userColumns.some((column) => column.name === name);
  if (!hasUserColumn("is_super_admin")) sqlite.exec("ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0");
  if (!hasUserColumn("totp_enabled")) sqlite.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0");
  if (!hasUserColumn("totp_secret_encrypted")) sqlite.exec("ALTER TABLE users ADD COLUMN totp_secret_encrypted TEXT");
  if (!hasUserColumn("totp_recovery_codes_encrypted")) sqlite.exec("ALTER TABLE users ADD COLUMN totp_recovery_codes_encrypted TEXT");
  if (!hasUserColumn("totp_updated_at")) sqlite.exec("ALTER TABLE users ADD COLUMN totp_updated_at INTEGER");
  sqlite.prepare("UPDATE users SET is_super_admin = 1, role = 'admin' WHERE lower(username) = lower(?)").run(env.defaultAdminUsername);

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
  if (!hasColumn("doc_uid")) sqlite.exec("ALTER TABLE docs ADD COLUMN doc_uid TEXT");
  if (!hasColumn("owner_id")) sqlite.exec("ALTER TABLE docs ADD COLUMN owner_id INTEGER REFERENCES users(id)");
  if (!hasColumn("owner_role")) sqlite.exec("ALTER TABLE docs ADD COLUMN owner_role TEXT NOT NULL DEFAULT 'user'");
  if (!hasColumn("scope")) sqlite.exec("ALTER TABLE docs ADD COLUMN scope TEXT NOT NULL DEFAULT 'user'");
  if (!hasColumn("is_super_admin_doc")) sqlite.exec("ALTER TABLE docs ADD COLUMN is_super_admin_doc INTEGER NOT NULL DEFAULT 0");
  if (!hasColumn("visibility")) sqlite.exec("ALTER TABLE docs ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
  if (!hasColumn("tenant_key")) sqlite.exec("ALTER TABLE docs ADD COLUMN tenant_key TEXT NOT NULL DEFAULT 'default'");
  if (!hasColumn("deleted_by")) sqlite.exec("ALTER TABLE docs ADD COLUMN deleted_by INTEGER REFERENCES users(id)");
  if (!hasColumn("revision")) sqlite.exec("ALTER TABLE docs ADD COLUMN revision INTEGER NOT NULL DEFAULT 1");
  const sqliteDocIdentityStats = backfillSqliteDocumentIdentity();
  const orphanOwnerCount = Number((sqlite.prepare("SELECT COUNT(*) AS count FROM docs WHERE owner_id IS NULL").get() as { count: number }).count);
  if (orphanOwnerCount > 0) {
    const fallbackOwner = sqlite.prepare("SELECT id FROM users WHERE lower(username) = lower(?) ORDER BY id LIMIT 1").get(env.defaultAdminUsername) as { id: number } | undefined;
    if (!fallbackOwner) throw new Error("Cannot enforce docs.owner_id: orphan documents exist and the default super admin is missing.");
    sqlite.prepare("UPDATE docs SET owner_id = ?, owner_role = 'super_admin', scope = 'admin', is_super_admin_doc = 1, visibility = 'private' WHERE owner_id IS NULL").run(fallbackOwner.id);
  }
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS uk_documents_doc_uid ON docs(doc_uid)");
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS docs_doc_uid_required_insert
    BEFORE INSERT ON docs
    WHEN NEW.doc_uid IS NULL OR NEW.doc_uid = ''
    BEGIN
      SELECT RAISE(ABORT, 'docs.doc_uid is required');
    END;

    CREATE TRIGGER IF NOT EXISTS docs_doc_uid_required_update
    BEFORE UPDATE OF doc_uid ON docs
    WHEN NEW.doc_uid IS NULL OR NEW.doc_uid = ''
    BEGIN
      SELECT RAISE(ABORT, 'docs.doc_uid is required');
    END;

    CREATE TRIGGER IF NOT EXISTS docs_owner_required_insert
    BEFORE INSERT ON docs
    WHEN NEW.owner_id IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'docs.owner_id is required');
    END;

    CREATE TRIGGER IF NOT EXISTS docs_owner_required_update
    BEFORE UPDATE OF owner_id ON docs
    WHEN NEW.owner_id IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'docs.owner_id is required');
    END;
  `);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON docs(owner_id)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_documents_super_admin_doc ON docs(is_super_admin_doc)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_documents_tenant_owner_doc ON docs(tenant_key, owner_id, doc_uid)");
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
  const formColumns = sqlite.prepare("PRAGMA table_info(forms)").all() as Array<{ name: string }>;
  const hasFormColumn = (name: string) => formColumns.some((column) => column.name === name);
  if (!hasFormColumn("exclusive_info")) sqlite.exec("ALTER TABLE forms ADD COLUMN exclusive_info TEXT");
  if (!hasFormColumn("privacy_notice")) sqlite.exec("ALTER TABLE forms ADD COLUMN privacy_notice TEXT");
  if (!hasFormColumn("retention_days")) sqlite.exec("ALTER TABLE forms ADD COLUMN retention_days INTEGER");
  if (!hasFormColumn("store_user_agent")) sqlite.exec("ALTER TABLE forms ADD COLUMN store_user_agent INTEGER NOT NULL DEFAULT 0");

  const submissionColumns = sqlite.prepare("PRAGMA table_info(form_submissions)").all() as Array<{ name: string }>;
  if (!submissionColumns.some((column) => column.name === "submitter_id")) sqlite.exec("ALTER TABLE form_submissions ADD COLUMN submitter_id TEXT");
  sqlite.exec("UPDATE form_submissions SET submitter_id = NULL WHERE form_id IN (SELECT id FROM forms WHERE allow_multiple = 1)");
  sqlite.exec("DROP INDEX IF EXISTS form_submissions_identity_idx");
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS form_submissions_identity_unique ON form_submissions(form_id, submitter_id)");

  const uploadColumns = sqlite.prepare("PRAGMA table_info(uploads)").all() as Array<{ name: string }>;
  if (!uploadColumns.some((column) => column.name === "detached_at")) sqlite.exec("ALTER TABLE uploads ADD COLUMN detached_at INTEGER");
  sqlite.exec("CREATE INDEX IF NOT EXISTS uploads_detached_idx ON uploads(detached_at)");

  const shareColumns = sqlite.prepare("PRAGMA table_info(shares)").all() as Array<{ name: string }>;
  const hasShareColumn = (name: string) => shareColumns.some((column) => column.name === name);
  if (!hasShareColumn("custom_slug")) sqlite.exec("ALTER TABLE shares ADD COLUMN custom_slug TEXT");
  if (!hasShareColumn("share_token")) {
    sqlite.exec("ALTER TABLE shares ADD COLUMN share_token TEXT");
  }
  backfillSqliteShareTokens();
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS shares_share_token_unique ON shares(share_token)");
  if (!hasShareColumn("review_status")) sqlite.exec("ALTER TABLE shares ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved'");
  if (!hasShareColumn("review_note")) sqlite.exec("ALTER TABLE shares ADD COLUMN review_note TEXT");
  if (!hasShareColumn("review_content_hash")) sqlite.exec("ALTER TABLE shares ADD COLUMN review_content_hash TEXT");
  if (!hasShareColumn("requested_by")) sqlite.exec("ALTER TABLE shares ADD COLUMN requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
  if (!hasShareColumn("reviewed_by")) sqlite.exec("ALTER TABLE shares ADD COLUMN reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
  if (!hasShareColumn("reviewed_at")) sqlite.exec("ALTER TABLE shares ADD COLUMN reviewed_at INTEGER");
  sqlite.exec("DELETE FROM shares WHERE id NOT IN (SELECT MIN(id) FROM shares GROUP BY doc_id)");
  sqlite.exec("DROP INDEX IF EXISTS shares_doc_idx");
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS shares_doc_unique ON shares(doc_id)");
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS shares_custom_slug_unique ON shares(custom_slug)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS uploads_doc_idx ON uploads(doc_id)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS uploads_user_created_idx ON uploads(user_id, created_at)");
  logDocIdentityStats(sqliteDocIdentityStats);
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
  await addMysqlColumnIfMissing(databaseName, "users", "is_super_admin", "TINYINT(1) NOT NULL DEFAULT 0");
  await addMysqlColumnIfMissing(databaseName, "users", "totp_secret_encrypted", "TEXT NULL");
  await addMysqlColumnIfMissing(databaseName, "users", "totp_recovery_codes_encrypted", "MEDIUMTEXT NULL");
  await addMysqlColumnIfMissing(databaseName, "users", "totp_updated_at", "DATETIME(3) NULL");
  await mysqlPool.query("UPDATE users SET is_super_admin = 1, role = 'admin' WHERE LOWER(username) = LOWER(?)", [env.defaultAdminUsername]);
  await addMysqlColumnIfMissing(databaseName, "docs", "doc_uid", "VARCHAR(32) NULL");
  await addMysqlColumnIfMissing(databaseName, "docs", "owner_id", "INT NULL");
  await addMysqlColumnIfMissing(databaseName, "docs", "owner_role", "VARCHAR(16) NOT NULL DEFAULT 'user'");
  await addMysqlColumnIfMissing(databaseName, "docs", "scope", "VARCHAR(16) NOT NULL DEFAULT 'user'");
  await addMysqlColumnIfMissing(databaseName, "docs", "is_super_admin_doc", "TINYINT(1) NOT NULL DEFAULT 0");
  await addMysqlColumnIfMissing(databaseName, "docs", "visibility", "VARCHAR(16) NOT NULL DEFAULT 'private'");
  await addMysqlColumnIfMissing(databaseName, "docs", "tenant_key", "VARCHAR(64) NOT NULL DEFAULT 'default'");
  await addMysqlColumnIfMissing(databaseName, "docs", "deleted_by", "INT NULL");
  await addMysqlColumnIfMissing(databaseName, "docs", "revision", "INT NOT NULL DEFAULT 1");
  const mysqlDocIdentityStats = await backfillMysqlDocumentIdentity();
  const [orphanOwnerRows] = await mysqlPool.query("SELECT COUNT(*) AS count FROM docs d LEFT JOIN users u ON u.id = d.owner_id WHERE d.owner_id IS NULL OR u.id IS NULL");
  const orphanOwnerCount = Number((orphanOwnerRows as Array<{ count: number }>)[0]?.count ?? 0);
  if (orphanOwnerCount > 0) {
    const [fallbackRows] = await mysqlPool.query("SELECT id FROM users WHERE LOWER(username) = LOWER(?) ORDER BY id LIMIT 1", [env.defaultAdminUsername]);
    const fallbackOwnerId = (fallbackRows as Array<{ id: number }>)[0]?.id;
    if (!fallbackOwnerId) throw new Error("Cannot enforce docs.owner_id: orphan documents exist and the default super admin is missing.");
    await mysqlPool.query("UPDATE docs d LEFT JOIN users u ON u.id = d.owner_id SET d.owner_id = ?, d.owner_role = 'super_admin', d.scope = 'admin', d.is_super_admin_doc = 1, d.visibility = 'private' WHERE d.owner_id IS NULL OR u.id IS NULL", [fallbackOwnerId]);
  }
  await mysqlPool.query("ALTER TABLE docs MODIFY COLUMN doc_uid VARCHAR(32) NOT NULL");
  await mysqlPool.query("ALTER TABLE docs MODIFY COLUMN owner_id INT NOT NULL");
  await addMysqlUniqueIndexIfMissing(databaseName, "docs", "uk_documents_doc_uid", "`doc_uid`");
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
  await addMysqlColumnIfMissing(databaseName, "forms", "exclusive_info", "TEXT NULL");
  await addMysqlColumnIfMissing(databaseName, "forms", "privacy_notice", "TEXT NULL");
  await addMysqlColumnIfMissing(databaseName, "forms", "retention_days", "INT NULL");
  await addMysqlColumnIfMissing(databaseName, "forms", "store_user_agent", "TINYINT(1) NOT NULL DEFAULT 0");
  await addMysqlColumnIfMissing(databaseName, "form_submissions", "submitter_id", "VARCHAR(64) NULL");
  await addMysqlColumnIfMissing(databaseName, "uploads", "detached_at", "DATETIME(3) NULL");
  await mysqlPool.query("UPDATE form_submissions s JOIN forms f ON f.id = s.form_id SET s.submitter_id = NULL WHERE f.allow_multiple = 1");
  await mysqlPool.query("ALTER TABLE form_submissions DROP INDEX form_submissions_identity_idx").catch(() => undefined);
  await addMysqlUniqueIndexIfMissing(databaseName, "form_submissions", "form_submissions_identity_unique", "`form_id`, `submitter_id`");
  await backfillMysqlShareTokens();
  await mysqlPool.query("ALTER TABLE shares MODIFY COLUMN share_token VARCHAR(64) NOT NULL");
  await addMysqlUniqueIndexIfMissing(databaseName, "shares", "shares_share_token_unique", "`share_token`");
  await mysqlPool.query("DELETE s FROM shares s JOIN shares keep ON keep.doc_id = s.doc_id AND keep.id < s.id");
  await mysqlPool.query("ALTER TABLE shares DROP INDEX shares_doc_idx").catch(() => undefined);
  await addMysqlUniqueIndexIfMissing(databaseName, "shares", "shares_doc_unique", "`doc_id`");

  await addMysqlIndexesIfMissing(databaseName, MYSQL_INDEXES);
  await addMysqlFulltextIndexesIfMissing(databaseName);
  await addMysqlIndexesIfMissing(databaseName, MYSQL_QUERY_INDEXES);
  await addMysqlForeignKeys(databaseName);
  logDocIdentityStats(mysqlDocIdentityStats);
}

function backfillSqliteDocumentIdentity() {
  if (!sqlite) throw new Error("SQLite connection is not available.");
  const stats = emptyDocIdentityStats();
  const rows = sqlite.prepare(`
    SELECT d.id, d.doc_uid AS docUid, d.created_by AS createdBy, d.owner_id AS ownerId,
           u.username AS username, u.role AS role
    FROM docs d
    LEFT JOIN users u ON u.id = d.created_by
    ORDER BY d.id ASC
  `).all() as Array<{
    id: number;
    docUid: string | null;
    createdBy: number | null;
    ownerId: number | null;
    username: string | null;
    role: string | null;
  }>;

  stats.total = rows.length;
  const usedDocUids = new Set(rows.map((row) => row.docUid).filter((value): value is string => !!value));
  const update = sqlite.prepare(`
    UPDATE docs
    SET doc_uid = COALESCE(NULLIF(doc_uid, ''), @docUid),
        owner_id = COALESCE(owner_id, @ownerId),
        owner_role = @ownerRole,
        scope = @scope,
        is_super_admin_doc = @isSuperAdminDoc,
        visibility = COALESCE(visibility, @visibility),
        tenant_key = COALESCE(tenant_key, 'default')
    WHERE id = @id
  `);

  for (const row of rows) {
    const hasDocUid = !!row.docUid;
    if (hasDocUid) stats.existingDocUid += 1;
    const identity = docIdentityForOwner(row);
    if (identity.orphan) stats.orphanDocs += 1;
    update.run({
      id: row.id,
      docUid: hasDocUid ? row.docUid : generateUniqueDocUid(usedDocUids, stats),
      ownerId: identity.ownerId,
      ownerRole: identity.ownerRole,
      scope: identity.scope,
      isSuperAdminDoc: identity.isSuperAdminDoc ? 1 : 0,
      visibility: identity.visibility
    });
    if (!hasDocUid) stats.generatedDocUid += 1;
  }

  return stats;
}

async function backfillMysqlDocumentIdentity() {
  if (!mysqlPool) throw new Error("MySQL connection is not available.");
  const stats = emptyDocIdentityStats();
  const [rawRows] = await mysqlPool.query(`
    SELECT d.id, d.doc_uid AS docUid, d.created_by AS createdBy, d.owner_id AS ownerId,
           u.username AS username, u.role AS role
    FROM docs d
    LEFT JOIN users u ON u.id = d.created_by
    ORDER BY d.id ASC
  `);
  const rows = rawRows as Array<{
    id: number;
    docUid: string | null;
    createdBy: number | null;
    ownerId: number | null;
    username: string | null;
    role: string | null;
  }>;
  stats.total = rows.length;
  const usedDocUids = new Set(rows.map((row) => row.docUid).filter((value): value is string => !!value));

  for (const row of rows) {
    const hasDocUid = !!row.docUid;
    if (hasDocUid) stats.existingDocUid += 1;
    const identity = docIdentityForOwner(row);
    if (identity.orphan) stats.orphanDocs += 1;
    await mysqlPool.query(`
      UPDATE docs
      SET doc_uid = IF(NULLIF(doc_uid, '') IS NULL, ?, doc_uid),
          owner_id = COALESCE(owner_id, ?),
          owner_role = ?,
          scope = ?,
          is_super_admin_doc = ?,
          visibility = COALESCE(visibility, ?),
          tenant_key = COALESCE(tenant_key, 'default')
      WHERE id = ?
    `, [
      hasDocUid ? row.docUid : generateUniqueDocUid(usedDocUids, stats),
      identity.ownerId,
      identity.ownerRole,
      identity.scope,
      identity.isSuperAdminDoc ? 1 : 0,
      identity.visibility,
      row.id
    ]);
    if (!hasDocUid) stats.generatedDocUid += 1;
  }

  return stats;
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

async function addMysqlFulltextIndexesIfMissing(databaseName: string) {
  if (!mysqlPool) throw new Error("MySQL connection is not available.");
  for (const index of MYSQL_FULLTEXT_INDEXES) {
    const [existingRows] = await mysqlPool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
       LIMIT 1`,
      [databaseName, index.table, index.name]
    );
    if ((existingRows as unknown[]).length) continue;
    await mysqlPool.query(`CREATE FULLTEXT INDEX \`${index.name}\` ON \`${index.table}\` (${index.columns})`);
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

async function addMysqlForeignKeys(databaseName: string) {
  if (!mysqlPool) throw new Error("MySQL connection is not available.");
  await mysqlPool.query("DELETE s FROM auth_sessions s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL");
  await mysqlPool.query("UPDATE spaces s LEFT JOIN users u ON u.id = s.owner_id SET s.owner_id = NULL WHERE s.owner_id IS NOT NULL AND u.id IS NULL");
  await mysqlPool.query("UPDATE docs d LEFT JOIN spaces s ON s.id = d.space_id SET d.space_id = NULL WHERE d.space_id IS NOT NULL AND s.id IS NULL");
  for (const column of ["created_by", "updated_by", "deleted_by"]) {
    await mysqlPool.query(`UPDATE docs d LEFT JOIN users u ON u.id = d.\`${column}\` SET d.\`${column}\` = NULL WHERE d.\`${column}\` IS NOT NULL AND u.id IS NULL`);
  }
  await mysqlPool.query("UPDATE uploads x LEFT JOIN users u ON u.id = x.user_id SET x.user_id = NULL WHERE x.user_id IS NOT NULL AND u.id IS NULL");
  await mysqlPool.query("UPDATE uploads x LEFT JOIN docs d ON d.id = x.doc_id SET x.doc_id = NULL WHERE x.doc_id IS NOT NULL AND d.id IS NULL");
  await mysqlPool.query("DELETE v FROM doc_versions v LEFT JOIN docs d ON d.id = v.doc_id WHERE d.id IS NULL");
  await mysqlPool.query("UPDATE doc_versions v LEFT JOIN users u ON u.id = v.created_by SET v.created_by = NULL WHERE v.created_by IS NOT NULL AND u.id IS NULL");
  await mysqlPool.query("DELETE v FROM danger_verifications v LEFT JOIN users u ON u.id = v.user_id WHERE u.id IS NULL");
  await mysqlPool.query("DELETE s FROM form_submissions s LEFT JOIN forms f ON f.id = s.form_id WHERE f.id IS NULL");
  await mysqlPool.query("DELETE s FROM shares s LEFT JOIN docs d ON d.id = s.doc_id WHERE d.id IS NULL");
  await mysqlPool.query("UPDATE shares s LEFT JOIN users u ON u.id = s.requested_by SET s.requested_by = NULL WHERE s.requested_by IS NOT NULL AND u.id IS NULL");
  await mysqlPool.query("UPDATE shares s LEFT JOIN users u ON u.id = s.reviewed_by SET s.reviewed_by = NULL WHERE s.reviewed_by IS NOT NULL AND u.id IS NULL");
  await mysqlPool.query("DELETE f FROM forms f LEFT JOIN users u ON u.id = f.owner_id WHERE u.id IS NULL");
  const constraints = [
    { table: "auth_sessions", name: "fk_auth_sessions_user", column: "user_id", target: "users(id)" },
    { table: "spaces", name: "fk_spaces_owner", column: "owner_id", target: "users(id)", onDelete: "SET NULL" },
    { table: "docs", name: "fk_docs_space", column: "space_id", target: "spaces(id)", onDelete: "SET NULL" },
    { table: "docs", name: "fk_docs_owner", column: "owner_id", target: "users(id)", onDelete: "RESTRICT" },
    { table: "docs", name: "fk_docs_created_by", column: "created_by", target: "users(id)", onDelete: "SET NULL" },
    { table: "docs", name: "fk_docs_updated_by", column: "updated_by", target: "users(id)", onDelete: "SET NULL" },
    { table: "docs", name: "fk_docs_deleted_by", column: "deleted_by", target: "users(id)", onDelete: "SET NULL" },
    { table: "shares", name: "fk_shares_doc", column: "doc_id", target: "docs(id)", onDelete: "CASCADE" },
    { table: "uploads", name: "fk_uploads_user", column: "user_id", target: "users(id)", onDelete: "SET NULL" },
    { table: "uploads", name: "fk_uploads_doc", column: "doc_id", target: "docs(id)", onDelete: "SET NULL" },
    { table: "doc_versions", name: "fk_doc_versions_doc", column: "doc_id", target: "docs(id)" },
    { table: "doc_versions", name: "fk_doc_versions_created_by", column: "created_by", target: "users(id)", onDelete: "SET NULL" },
    { table: "danger_verifications", name: "fk_danger_verifications_user", column: "user_id", target: "users(id)" },
    { table: "forms", name: "fk_forms_owner", column: "owner_id", target: "users(id)", onDelete: "CASCADE" },
    { table: "form_submissions", name: "fk_form_submissions_form", column: "form_id", target: "forms(id)", onDelete: "CASCADE" },
    { table: "shares", name: "fk_shares_requested_by", column: "requested_by", target: "users(id)", onDelete: "SET NULL" },
    { table: "shares", name: "fk_shares_reviewed_by", column: "reviewed_by", target: "users(id)", onDelete: "SET NULL" }
  ];
  for (const item of constraints) {
    const [rows] = await mysqlPool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
      [databaseName, item.table, item.name]
    );
    if ((rows as unknown[]).length) continue;
    await mysqlPool.query(
      `ALTER TABLE \`${item.table}\` ADD CONSTRAINT \`${item.name}\` FOREIGN KEY (\`${item.column}\`) REFERENCES ${item.target} ON DELETE ${item.onDelete ?? "CASCADE"}`
    );
  }
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
