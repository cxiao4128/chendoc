export const SQLITE_QUERY_INDEX_STATEMENTS = [
  "CREATE INDEX IF NOT EXISTS docs_status_idx ON docs(status)",
  "CREATE INDEX IF NOT EXISTS docs_created_by_idx ON docs(created_by)",
  "CREATE INDEX IF NOT EXISTS docs_created_by_deleted_at_idx ON docs(created_by, deleted_at)",
  "CREATE INDEX IF NOT EXISTS uploads_user_idx ON uploads(user_id)",
  "CREATE INDEX IF NOT EXISTS operation_logs_created_idx ON operation_logs(created_at)"
] as const;

export const MYSQL_QUERY_INDEXES = [
  { table: "docs", name: "docs_status_idx", columns: "`status`" },
  { table: "docs", name: "docs_created_by_idx", columns: "`created_by`" },
  { table: "docs", name: "docs_created_by_deleted_at_idx", columns: "`created_by`, `deleted_at`" },
  { table: "uploads", name: "uploads_user_idx", columns: "`user_id`" },
  { table: "operation_logs", name: "operation_logs_created_idx", columns: "`created_at`" }
] as const;
