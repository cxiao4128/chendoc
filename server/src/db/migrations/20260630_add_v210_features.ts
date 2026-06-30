// ChenDoc v2.10.0 - 新功能表结构
// 添加标签、模板、访问统计功能

// SQLite 建表语句
export const V210_SQLITE_TABLES = `
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    doc_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uk_tags_name_owner ON tags(name, owner_id);
  CREATE INDEX IF NOT EXISTS tags_owner_idx ON tags(owner_id);

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_uid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT,
    html TEXT NOT NULL,
    content_json TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    is_built_in INTEGER NOT NULL DEFAULT 0,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uk_templates_uid ON templates(template_uid);
  CREATE INDEX IF NOT EXISTS templates_owner_idx ON templates(owner_id);
  CREATE INDEX IF NOT EXISTS templates_sort_idx ON templates(sort);

  CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    visitor_hash TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    device TEXT,
    viewed_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS access_logs_target_idx ON access_logs(target_type, target_id);
  CREATE INDEX IF NOT EXISTS access_logs_viewed_idx ON access_logs(viewed_at);
` as const;

// MySQL 建表语句
export const V210_MYSQL_TABLES = [
  `CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    color VARCHAR(16) NOT NULL DEFAULT '#3b82f6',
    owner_id INT REFERENCES users(id) ON DELETE CASCADE,
    doc_count INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    UNIQUE INDEX uk_tags_name_owner (name, owner_id),
    INDEX tags_owner_idx (owner_id)
  )`,
  `CREATE TABLE IF NOT EXISTS templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_uid VARCHAR(32) NOT NULL UNIQUE,
    title VARCHAR(191) NOT NULL,
    summary TEXT,
    html MEDIUMTEXT NOT NULL,
    content_json MEDIUMTEXT,
    sort INT NOT NULL DEFAULT 0,
    is_built_in BOOLEAN NOT NULL DEFAULT FALSE,
    owner_id INT REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE INDEX uk_templates_uid (template_uid),
    INDEX templates_owner_idx (owner_id),
    INDEX templates_sort_idx (sort)
  )`,
  `CREATE TABLE IF NOT EXISTS access_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    target_type VARCHAR(8) NOT NULL,
    target_id INT NOT NULL,
    visitor_hash VARCHAR(64),
    ip_hash VARCHAR(64),
    user_agent TEXT,
    device VARCHAR(16),
    viewed_at DATETIME(3) NOT NULL,
    INDEX access_logs_target_idx (target_type, target_id),
    INDEX access_logs_viewed_idx (viewed_at)
  )`
] as const;