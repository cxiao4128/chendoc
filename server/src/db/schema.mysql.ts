import { boolean, datetime, index, int, mediumtext, mysqlTable, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

const id = (name = "id") => int(name).autoincrement().primaryKey();
const ts = (name: string) => datetime(name, { mode: "date", fsp: 3 });

export const users = mysqlTable("users", {
  id: id(),
  username: varchar("username", { length: 191 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 16 }).notNull().default("user"),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpSecretEncrypted: text("totp_secret_encrypted"),
  totpRecoveryCodesEncrypted: mediumtext("totp_recovery_codes_encrypted"),
  totpUpdatedAt: ts("totp_updated_at"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
});

export const invites = mysqlTable("invites", {
  id: id(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  status: varchar("status", { length: 16 }).notNull().default("unused"),
  createdBy: int("created_by"),
  usedBy: int("used_by"),
  usedAt: ts("used_at"),
  expireAt: ts("expire_at"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
});

export const captchas = mysqlTable("captchas", {
  id: varchar("id", { length: 96 }).primaryKey(),
  codeHash: varchar("code_hash", { length: 128 }).notNull(),
  tryCount: int("try_count").notNull().default(0),
  expireAt: ts("expire_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull()
});

export const cryptoKeys = mysqlTable("crypto_keys", {
  id: id(),
  keyId: varchar("key_id", { length: 96 }).notNull().unique(),
  publicKey: mediumtext("public_key").notNull(),
  privateKeyEncrypted: mediumtext("private_key_encrypted").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  expireAt: ts("expire_at").notNull(),
  createdAt: ts("created_at").notNull()
});

export const authSessions = mysqlTable("auth_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyEncrypted: text("key_encrypted").notNull(),
  expireAt: ts("expire_at").notNull(),
  lastSeenAt: ts("last_seen_at").notNull(),
  createdAt: ts("created_at").notNull()
}, (table) => [
  index("auth_sessions_user_idx").on(table.userId),
  index("auth_sessions_expire_idx").on(table.expireAt)
]);

export const spaces = mysqlTable("spaces", {
  id: id(),
  name: varchar("name", { length: 191 }).notNull(),
  description: text("description"),
  ownerId: int("owner_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
});

export const docs = mysqlTable("docs", {
  id: id(),
  docUid: varchar("doc_uid", { length: 32 }).notNull(),
  spaceId: int("space_id").references(() => spaces.id, { onDelete: "set null" }),
  parentId: int("parent_id"),
  title: varchar("title", { length: 191 }).notNull(),
  contentJson: mediumtext("content_json").notNull(),
  contentHtml: mediumtext("content_html").notNull(),
  contentJsonCiphertext: mediumtext("content_json_ciphertext"),
  contentJsonIv: varchar("content_json_iv", { length: 64 }),
  contentJsonTag: varchar("content_json_tag", { length: 64 }),
  contentJsonKeyVersion: varchar("content_json_key_version", { length: 32 }),
  contentHtmlCiphertext: mediumtext("content_html_ciphertext"),
  contentHtmlIv: varchar("content_html_iv", { length: 64 }),
  contentHtmlTag: varchar("content_html_tag", { length: 64 }),
  contentHtmlKeyVersion: varchar("content_html_key_version", { length: 32 }),
  coverUrl: text("cover_url"),
  summary: text("summary"),
  tags: text("tags").notNull().default("[]"),
  pinned: boolean("pinned").notNull().default(false),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  sort: int("sort").notNull().default(0),
  ownerId: int("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ownerRole: varchar("owner_role", { length: 16 }).notNull().default("user"),
  createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: int("updated_by").references(() => users.id, { onDelete: "set null" }),
  scope: varchar("scope", { length: 16 }).notNull().default("user"),
  isSuperAdminDoc: boolean("is_super_admin_doc").notNull().default(false),
  visibility: varchar("visibility", { length: 16 }).notNull().default("private"),
  tenantKey: varchar("tenant_key", { length: 64 }).notNull().default("default"),
  deletedAt: ts("deleted_at"),
  deletedBy: int("deleted_by").references(() => users.id, { onDelete: "set null" }),
  revision: int("revision").notNull().default(1),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
}, (table) => [
  uniqueIndex("uk_documents_doc_uid").on(table.docUid),
  index("docs_parent_idx").on(table.parentId),
  index("docs_deleted_idx").on(table.deletedAt),
  index("docs_space_idx").on(table.spaceId),
  index("docs_pinned_idx").on(table.pinned),
  index("docs_status_idx").on(table.status),
  index("idx_documents_owner_id").on(table.ownerId),
  index("idx_documents_super_admin_doc").on(table.isSuperAdminDoc),
  index("idx_documents_tenant_owner_doc").on(table.tenantKey, table.ownerId, table.docUid),
  index("docs_created_by_idx").on(table.createdBy),
  index("docs_created_by_deleted_at_idx").on(table.createdBy, table.deletedAt),
  index("docs_updated_idx").on(table.updatedAt),
  index("docs_owner_deleted_order_idx").on(table.ownerId, table.deletedAt, table.pinned, table.updatedAt),
  index("docs_admin_deleted_order_idx").on(table.isSuperAdminDoc, table.deletedAt, table.pinned, table.updatedAt)
]);

export const shares = mysqlTable("shares", {
  id: id(),
  docId: int("doc_id").notNull().references(() => docs.id, { onDelete: "cascade" }),
  shareCode: int("share_code").notNull().unique(),
  shareToken: varchar("share_token", { length: 64 }).notNull().unique(),
  customSlug: varchar("custom_slug", { length: 191 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  isEnabled: boolean("is_enabled").notNull().default(true),
  reviewStatus: varchar("review_status", { length: 16 }).notNull().default("approved"),
  reviewNote: text("review_note"),
  reviewContentHash: varchar("review_content_hash", { length: 128 }),
  requestedBy: int("requested_by").references(() => users.id, { onDelete: "set null" }),
  reviewedBy: int("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: ts("reviewed_at"),
  expireAt: ts("expire_at"),
  viewCount: int("view_count").notNull().default(0),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
}, (table) => [
  uniqueIndex("shares_doc_unique").on(table.docId)
]);

export const uploads = mysqlTable("uploads", {
  id: id(),
  userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
  docId: int("doc_id").references(() => docs.id, { onDelete: "set null" }),
  objectKey: varchar("object_key", { length: 191 }).notNull().unique(),
  publicUrl: text("public_url").notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  fileSize: int("file_size").notNull(),
  kind: varchar("kind", { length: 16 }).notNull(),
  originalName: varchar("original_name", { length: 255 }),
  detachedAt: ts("detached_at"),
  createdAt: ts("created_at").notNull()
}, (table) => [
  index("uploads_user_idx").on(table.userId),
  index("uploads_doc_idx").on(table.docId),
  index("uploads_user_created_idx").on(table.userId, table.createdAt),
  index("uploads_detached_idx").on(table.detachedAt)
]);

export const docVersions = mysqlTable("doc_versions", {
  id: id(),
  docId: int("doc_id").notNull().references(() => docs.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 191 }).notNull(),
  contentJson: mediumtext("content_json").notNull(),
  contentHtml: mediumtext("content_html").notNull(),
  contentJsonCiphertext: mediumtext("content_json_ciphertext"),
  contentJsonIv: varchar("content_json_iv", { length: 64 }),
  contentJsonTag: varchar("content_json_tag", { length: 64 }),
  contentJsonKeyVersion: varchar("content_json_key_version", { length: 32 }),
  contentHtmlCiphertext: mediumtext("content_html_ciphertext"),
  contentHtmlIv: varchar("content_html_iv", { length: 64 }),
  contentHtmlTag: varchar("content_html_tag", { length: 64 }),
  contentHtmlKeyVersion: varchar("content_html_key_version", { length: 32 }),
  createdBy: int("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull()
}, (table) => [
  index("doc_versions_doc_created_idx").on(table.docId, table.createdAt)
]);

export const loginFailures = mysqlTable("login_failures", {
  id: id(),
  username: varchar("username", { length: 191 }).notNull(),
  scope: varchar("scope", { length: 16 }).notNull().default("user"),
  dimension: varchar("dimension", { length: 16 }).notNull(),
  dimensionValue: varchar("dimension_value", { length: 191 }).notNull(),
  failCount: int("fail_count").notNull().default(0),
  firstFailedAt: ts("first_failed_at").notNull(),
  lastFailedAt: ts("last_failed_at").notNull(),
  lockedUntil: ts("locked_until")
}, (table) => [
  uniqueIndex("login_failures_dimension_unique").on(table.username, table.scope, table.dimension, table.dimensionValue),
  index("login_failures_lookup_idx").on(table.username, table.scope, table.dimension),
  index("login_failures_last_failed_idx").on(table.lastFailedAt),
  index("login_failures_locked_idx").on(table.lockedUntil)
]);

export const dangerVerifications = mysqlTable("danger_verifications", {
  id: id(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  verifiedAt: ts("verified_at").notNull(),
  expireAt: ts("expire_at").notNull()
}, (table) => [
  uniqueIndex("danger_verifications_session_unique").on(table.sessionId),
  index("danger_verifications_user_idx").on(table.userId),
  index("danger_verifications_expire_idx").on(table.expireAt)
]);

export const auditLogs = mysqlTable("audit_logs", {
  id: id(),
  userId: int("user_id"),
  username: varchar("username", { length: 191 }),
  action: varchar("action", { length: 96 }).notNull(),
  result: varchar("result", { length: 24 }).notNull(),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  riskLevel: varchar("risk_level", { length: 16 }).notNull().default("low"),
  detail: mediumtext("detail"),
  createdAt: ts("created_at").notNull()
}, (table) => [
  index("audit_logs_user_idx").on(table.userId),
  index("audit_logs_action_idx").on(table.action),
  index("audit_logs_created_idx").on(table.createdAt)
]);

export const logs = mysqlTable("logs", {
  id: id(),
  logUid: varchar("log_uid", { length: 64 }).notNull().unique(),
  type: varchar("type", { length: 32 }).notNull(),
  userId: int("user_id"),
  role: varchar("role", { length: 32 }),
  action: varchar("action", { length: 96 }).notNull(),
  targetType: varchar("target_type", { length: 64 }).notNull(),
  targetId: varchar("target_id", { length: 191 }).notNull(),
  docUid: varchar("doc_uid", { length: 32 }),
  ownerId: int("owner_id"),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  path: varchar("path", { length: 512 }),
  method: varchar("method", { length: 16 }),
  statusCode: int("status_code"),
  message: text("message"),
  data: mediumtext("data"),
  createdAt: ts("created_at").notNull()
}, (table) => [
  index("logs_type_created_idx").on(table.type, table.createdAt),
  index("logs_user_created_idx").on(table.userId, table.createdAt),
  index("logs_action_created_idx").on(table.action, table.createdAt),
  index("logs_doc_uid_idx").on(table.docUid),
  index("logs_created_idx").on(table.createdAt)
]);

export const settings = mysqlTable("settings", {
  id: id(),
  key: varchar("key", { length: 191 }).notNull().unique(),
  value: mediumtext("value").notNull(),
  type: varchar("type", { length: 16 }).notNull().default("string"),
  encrypted: boolean("encrypted").notNull().default(false),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
});

export const operationLogs = mysqlTable("operation_logs", {
  id: id(),
  userId: int("user_id"),
  action: varchar("action", { length: 96 }).notNull(),
  targetType: varchar("target_type", { length: 64 }).notNull(),
  targetId: varchar("target_id", { length: 191 }).notNull(),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  createdAt: ts("created_at").notNull()
}, (table) => [
  index("operation_logs_target_idx").on(table.targetType, table.targetId),
  index("operation_logs_user_idx").on(table.userId),
  index("operation_logs_created_idx").on(table.createdAt)
]);

export const uniqueShareCode = uniqueIndex("shares_share_code_unique").on(shares.shareCode);

// ===== 收集表模块 =====
export const forms = mysqlTable("forms", {
  id: id(),
  formUid: varchar("form_uid", { length: 32 }).notNull().unique(),
  title: varchar("title", { length: 191 }).notNull(),
  description: text("description"),
  fields: mediumtext("fields").notNull(),
  ownerId: int("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  maxSubmissions: int("max_submissions"),
  allowMultiple: boolean("allow_multiple").notNull().default(false),
  exclusiveInfo: text("exclusive_info"),  // JSON: 提交后展示给填写者的专属信息
  privacyNotice: text("privacy_notice"),
  retentionDays: int("retention_days"),
  storeUserAgent: boolean("store_user_agent").notNull().default(false),
  viewCount: int("view_count").notNull().default(0),
  submissionCount: int("submission_count").notNull().default(0),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
}, (table) => [
  uniqueIndex("uk_forms_form_uid").on(table.formUid),
  index("forms_owner_idx").on(table.ownerId),
  index("forms_status_idx").on(table.status)
]);

export const formSubmissions = mysqlTable("form_submissions", {
  id: id(),
  formId: int("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  data: mediumtext("data").notNull(),
  ip: varchar("ip", { length: 64 }).notNull(), // 不存原始 IP，只存不可逆来源摘要
  submitterId: varchar("submitter_id", { length: 64 }),
  userAgent: text("user_agent"),
  submittedAt: ts("submitted_at").notNull()
}, (table) => [
  index("form_submissions_form_idx").on(table.formId),
  uniqueIndex("form_submissions_identity_unique").on(table.formId, table.submitterId),
  index("form_submissions_ip_idx").on(table.ip),
  index("form_submissions_time_idx").on(table.submittedAt)
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
