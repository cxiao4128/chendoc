export const MYSQL_TABLE_NAMES = [
  "users",
  "spaces",
  "invites",
  "captchas",
  "crypto_keys",
  "auth_sessions",
  "docs",
  "shares",
  "uploads",
  "doc_versions",
  "settings",
  "operation_logs",
  "login_failures",
  "danger_verifications",
  "audit_logs"
] as const;

const tableOptions = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

export const MYSQL_CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(191) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'user',
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
    totp_secret_encrypted TEXT NULL,
    totp_recovery_codes_encrypted MEDIUMTEXT NULL,
    totp_updated_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY users_username_unique (username)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS spaces (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(191) NOT NULL,
    description TEXT NULL,
    owner_id INT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS invites (
    id INT NOT NULL AUTO_INCREMENT,
    code VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'unused',
    created_by INT NULL,
    used_by INT NULL,
    used_at DATETIME(3) NULL,
    expire_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY invites_code_unique (code)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS captchas (
    id VARCHAR(96) NOT NULL,
    code_hash VARCHAR(128) NOT NULL,
    try_count INT NOT NULL DEFAULT 0,
    expire_at DATETIME(3) NOT NULL,
    used_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS crypto_keys (
    id INT NOT NULL AUTO_INCREMENT,
    key_id VARCHAR(96) NOT NULL,
    public_key MEDIUMTEXT NOT NULL,
    private_key_encrypted MEDIUMTEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    expire_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY crypto_keys_key_id_unique (key_id)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id VARCHAR(64) NOT NULL,
    user_id INT NOT NULL,
    key_encrypted TEXT NOT NULL,
    expire_at DATETIME(3) NOT NULL,
    last_seen_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    KEY auth_sessions_user_idx (user_id),
    KEY auth_sessions_expire_idx (expire_at)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS docs (
    id INT NOT NULL AUTO_INCREMENT,
    space_id INT NULL,
    parent_id INT NULL,
    title VARCHAR(191) NOT NULL,
    content_json MEDIUMTEXT NOT NULL,
    content_html MEDIUMTEXT NOT NULL,
    content_json_ciphertext MEDIUMTEXT NULL,
    content_json_iv VARCHAR(64) NULL,
    content_json_tag VARCHAR(64) NULL,
    content_json_key_version VARCHAR(32) NULL,
    content_html_ciphertext MEDIUMTEXT NULL,
    content_html_iv VARCHAR(64) NULL,
    content_html_tag VARCHAR(64) NULL,
    content_html_key_version VARCHAR(32) NULL,
    cover_url TEXT NULL,
    summary TEXT NULL,
    tags TEXT NOT NULL,
    pinned TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    sort INT NOT NULL DEFAULT 0,
    created_by INT NULL,
    updated_by INT NULL,
    deleted_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    KEY docs_parent_idx (parent_id),
    KEY docs_deleted_idx (deleted_at),
    KEY docs_space_idx (space_id),
    KEY docs_pinned_idx (pinned),
    KEY docs_updated_idx (updated_at)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS shares (
    id INT NOT NULL AUTO_INCREMENT,
    doc_id INT NOT NULL,
    share_code INT NOT NULL,
    share_token VARCHAR(64) NOT NULL,
    custom_slug VARCHAR(191) NULL,
    password_hash VARCHAR(255) NULL,
    is_enabled TINYINT(1) NOT NULL DEFAULT 1,
    review_status VARCHAR(16) NOT NULL DEFAULT 'approved',
    review_note TEXT NULL,
    review_content_hash VARCHAR(128) NULL,
    requested_by INT NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME(3) NULL,
    expire_at DATETIME(3) NULL,
    view_count INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY shares_share_code_unique (share_code),
    UNIQUE KEY shares_share_token_unique (share_token),
    UNIQUE KEY shares_custom_slug_unique (custom_slug),
    KEY shares_doc_idx (doc_id)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS uploads (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NULL,
    doc_id INT NULL,
    object_key VARCHAR(191) NOT NULL,
    public_url TEXT NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size INT NOT NULL,
    kind VARCHAR(16) NOT NULL,
    original_name VARCHAR(255) NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uploads_object_key_unique (object_key)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS doc_versions (
    id INT NOT NULL AUTO_INCREMENT,
    doc_id INT NOT NULL,
    title VARCHAR(191) NOT NULL,
    content_json MEDIUMTEXT NOT NULL,
    content_html MEDIUMTEXT NOT NULL,
    content_json_ciphertext MEDIUMTEXT NULL,
    content_json_iv VARCHAR(64) NULL,
    content_json_tag VARCHAR(64) NULL,
    content_json_key_version VARCHAR(32) NULL,
    content_html_ciphertext MEDIUMTEXT NULL,
    content_html_iv VARCHAR(64) NULL,
    content_html_tag VARCHAR(64) NULL,
    content_html_key_version VARCHAR(32) NULL,
    created_by INT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    KEY doc_versions_doc_created_idx (doc_id, created_at)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS settings (
    id INT NOT NULL AUTO_INCREMENT,
    \`key\` VARCHAR(191) NOT NULL,
    value MEDIUMTEXT NOT NULL,
    type VARCHAR(16) NOT NULL DEFAULT 'string',
    encrypted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY settings_key_unique (\`key\`)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS operation_logs (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NULL,
    action VARCHAR(96) NOT NULL,
    target_type VARCHAR(64) NOT NULL,
    target_id VARCHAR(191) NOT NULL,
    ip VARCHAR(64) NULL,
    user_agent TEXT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    KEY operation_logs_target_idx (target_type, target_id),
    KEY operation_logs_user_idx (user_id)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS login_failures (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(191) NOT NULL,
    scope VARCHAR(16) NOT NULL DEFAULT 'user',
    dimension VARCHAR(16) NOT NULL,
    dimension_value VARCHAR(191) NOT NULL,
    fail_count INT NOT NULL DEFAULT 0,
    first_failed_at DATETIME(3) NOT NULL,
    last_failed_at DATETIME(3) NOT NULL,
    locked_until DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY login_failures_dimension_unique (username, scope, dimension, dimension_value),
    KEY login_failures_lookup_idx (username, scope, dimension),
    KEY login_failures_last_failed_idx (last_failed_at),
    KEY login_failures_locked_idx (locked_until)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS danger_verifications (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    verified_at DATETIME(3) NOT NULL,
    expire_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY danger_verifications_session_unique (session_id),
    KEY danger_verifications_user_idx (user_id),
    KEY danger_verifications_expire_idx (expire_at)
  ) ${tableOptions}`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NULL,
    username VARCHAR(191) NULL,
    action VARCHAR(96) NOT NULL,
    result VARCHAR(24) NOT NULL,
    ip VARCHAR(64) NULL,
    user_agent TEXT NULL,
    risk_level VARCHAR(16) NOT NULL DEFAULT 'low',
    detail MEDIUMTEXT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    KEY audit_logs_user_idx (user_id),
    KEY audit_logs_action_idx (action),
    KEY audit_logs_created_idx (created_at)
  ) ${tableOptions}`
] as const;

export const MYSQL_INDEXES = [
  { table: "docs", name: "docs_created_by_idx", columns: "`created_by`" },
  { table: "docs", name: "docs_status_idx", columns: "`status`" },
  { table: "docs", name: "docs_list_admin_idx", columns: "`deleted_at`, `pinned`, `updated_at`" },
  { table: "docs", name: "docs_list_user_idx", columns: "`created_by`, `deleted_at`, `pinned`, `updated_at`" },
  { table: "docs", name: "docs_trash_idx", columns: "`deleted_at`, `updated_at`" },
  { table: "users", name: "users_role_idx", columns: "`role`" },
  { table: "users", name: "users_status_idx", columns: "`status`" },
  { table: "shares", name: "shares_review_idx", columns: "`review_status`, `created_at`" },
  { table: "shares", name: "shares_doc_review_idx", columns: "`doc_id`, `review_status`" },
  { table: "operation_logs", name: "operation_logs_created_idx", columns: "`created_at`" },
  { table: "operation_logs", name: "operation_logs_user_created_idx", columns: "`user_id`, `created_at`" },
  { table: "shares", name: "shares_public_lookup_idx", columns: "`share_code`, `is_enabled`, `review_status`" },
  { table: "login_failures", name: "login_failures_cleanup_idx", columns: "`last_failed_at`, `locked_until`" },
  { table: "danger_verifications", name: "danger_verifications_cleanup_idx", columns: "`expire_at`" }
] as const;
