import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  isSuperAdmin: integer("is_super_admin", { mode: "boolean" }).notNull().default(false),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  totpSecretEncrypted: text("totp_secret_encrypted"),
  totpRecoveryCodesEncrypted: text("totp_recovery_codes_encrypted"),
  totpUpdatedAt: integer("totp_updated_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const invites = sqliteTable("invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  status: text("status", { enum: ["unused", "used", "disabled", "expired"] }).notNull().default("unused"),
  createdBy: integer("created_by").references(() => users.id),
  usedBy: integer("used_by").references(() => users.id),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  expireAt: integer("expire_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const captchas = sqliteTable("captchas", {
  id: text("id").primaryKey(),
  codeHash: text("code_hash").notNull(),
  tryCount: integer("try_count").notNull().default(0),
  expireAt: integer("expire_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const cryptoKeys = sqliteTable("crypto_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keyId: text("key_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  privateKeyEncrypted: text("private_key_encrypted").notNull(),
  status: text("status", { enum: ["active", "retired"] }).notNull().default("active"),
  expireAt: integer("expire_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  keyEncrypted: text("key_encrypted").notNull(),
  expireAt: integer("expire_at", { mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  version: integer("version").notNull().default(1)
}, (table) => ({
  authSessionsUserIdx: index("auth_sessions_user_idx").on(table.userId),
  authSessionsExpireIdx: index("auth_sessions_expire_idx").on(table.expireAt)
}));

export const spaces = sqliteTable("spaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: integer("owner_id").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const docs = sqliteTable("docs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docUid: text("doc_uid").notNull(),
  spaceId: integer("space_id").references(() => spaces.id, { onDelete: "set null" }),
  parentId: integer("parent_id"),
  title: text("title").notNull(),
  contentJson: text("content_json").notNull(),
  contentHtml: text("content_html").notNull(),
  contentJsonCiphertext: text("content_json_ciphertext"),
  contentJsonIv: text("content_json_iv"),
  contentJsonTag: text("content_json_tag"),
  contentJsonKeyVersion: text("content_json_key_version"),
  contentHtmlCiphertext: text("content_html_ciphertext"),
  contentHtmlIv: text("content_html_iv"),
  contentHtmlTag: text("content_html_tag"),
  contentHtmlKeyVersion: text("content_html_key_version"),
  coverUrl: text("cover_url"),
  summary: text("summary"),
  tags: text("tags").notNull().default("[]"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  sort: integer("sort").notNull().default(0),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ownerRole: text("owner_role", { enum: ["user", "doc_admin", "super_admin"] }).notNull().default("user"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  scope: text("scope", { enum: ["user", "admin", "system"] }).notNull().default("user"),
  isSuperAdminDoc: integer("is_super_admin_doc", { mode: "boolean" }).notNull().default(false),
  visibility: text("visibility", { enum: ["private", "shared", "public"] }).notNull().default("private"),
  tenantKey: text("tenant_key").notNull().default("default"),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  deletedBy: integer("deleted_by").references(() => users.id, { onDelete: "set null" }),
  revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  docUidUnique: uniqueIndex("uk_documents_doc_uid").on(table.docUid),
  docParentIdx: index("docs_parent_idx").on(table.parentId),
  docDeletedIdx: index("docs_deleted_idx").on(table.deletedAt),
  docSpaceIdx: index("docs_space_idx").on(table.spaceId),
  docPinnedIdx: index("docs_pinned_idx").on(table.pinned),
  docStatusIdx: index("docs_status_idx").on(table.status),
  docOwnerIdx: index("idx_documents_owner_id").on(table.ownerId),
  docSuperAdminIdx: index("idx_documents_super_admin_doc").on(table.isSuperAdminDoc),
  docTenantOwnerDocIdx: index("idx_documents_tenant_owner_doc").on(table.tenantKey, table.ownerId, table.docUid),
  docCreatedByIdx: index("docs_created_by_idx").on(table.createdBy),
  docCreatedByDeletedAtIdx: index("docs_created_by_deleted_at_idx").on(table.createdBy, table.deletedAt),
  docUpdatedIdx: index("docs_updated_idx").on(table.updatedAt),
  docOwnerDeletedOrderIdx: index("docs_owner_deleted_order_idx").on(table.ownerId, table.deletedAt, table.pinned, table.updatedAt),
  docAdminDeletedOrderIdx: index("docs_admin_deleted_order_idx").on(table.isSuperAdminDoc, table.deletedAt, table.pinned, table.updatedAt)
}));

export const shares = sqliteTable("shares", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docId: integer("doc_id").notNull().references(() => docs.id, { onDelete: "cascade" }),
  shareCode: integer("share_code").notNull().unique(),
  shareToken: text("share_token").notNull().unique(),
  customSlug: text("custom_slug").unique(),
  passwordHash: text("password_hash"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  reviewStatus: text("review_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("approved"),
  reviewNote: text("review_note"),
  reviewContentHash: text("review_content_hash"),
  requestedBy: integer("requested_by").references(() => users.id, { onDelete: "set null" }),
  reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  expireAt: integer("expire_at", { mode: "timestamp_ms" }),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  shareDocUnique: uniqueIndex("shares_doc_unique").on(table.docId)
}));

export const uploads = sqliteTable("uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  docId: integer("doc_id").references(() => docs.id, { onDelete: "set null" }),
  objectKey: text("object_key").notNull().unique(),
  publicUrl: text("public_url").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  kind: text("kind", { enum: ["image", "video", "file"] }).notNull(),
  originalName: text("original_name"),
  detachedAt: integer("detached_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  uploadUserIdx: index("uploads_user_idx").on(table.userId),
  uploadDocIdx: index("uploads_doc_idx").on(table.docId),
  uploadUserCreatedIdx: index("uploads_user_created_idx").on(table.userId, table.createdAt),
  uploadDetachedIdx: index("uploads_detached_idx").on(table.detachedAt)
}));

export const docVersions = sqliteTable("doc_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docId: integer("doc_id").notNull().references(() => docs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  contentJson: text("content_json").notNull(),
  contentHtml: text("content_html").notNull(),
  contentJsonCiphertext: text("content_json_ciphertext"),
  contentJsonIv: text("content_json_iv"),
  contentJsonTag: text("content_json_tag"),
  contentJsonKeyVersion: text("content_json_key_version"),
  contentHtmlCiphertext: text("content_html_ciphertext"),
  contentHtmlIv: text("content_html_iv"),
  contentHtmlTag: text("content_html_tag"),
  contentHtmlKeyVersion: text("content_html_key_version"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  docVersionsDocCreatedIdx: index("doc_versions_doc_created_idx").on(table.docId, table.createdAt)
}));

export const loginFailures = sqliteTable("login_failures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  scope: text("scope", { enum: ["admin", "user"] }).notNull().default("user"),
  dimension: text("dimension", { enum: ["account", "ip"] }).notNull(),
  dimensionValue: text("dimension_value").notNull(),
  failCount: integer("fail_count").notNull().default(0),
  firstFailedAt: integer("first_failed_at", { mode: "timestamp_ms" }).notNull(),
  lastFailedAt: integer("last_failed_at", { mode: "timestamp_ms" }).notNull(),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" })
}, (table) => ({
  loginFailuresDimensionUnique: uniqueIndex("login_failures_dimension_unique").on(table.username, table.scope, table.dimension, table.dimensionValue),
  loginFailuresLookupIdx: index("login_failures_lookup_idx").on(table.username, table.scope, table.dimension, table.lockedUntil),
  loginFailuresLastFailedIdx: index("login_failures_last_failed_idx").on(table.lastFailedAt),
  loginFailuresLockedIdx: index("login_failures_locked_idx").on(table.lockedUntil)
}));

export const dangerVerifications = sqliteTable("danger_verifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  sessionId: text("session_id").notNull(),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }).notNull(),
  expireAt: integer("expire_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  dangerVerificationsSessionUnique: uniqueIndex("danger_verifications_session_unique").on(table.sessionId),
  dangerVerificationsUserIdx: index("danger_verifications_user_idx").on(table.userId),
  dangerVerificationsExpireIdx: index("danger_verifications_expire_idx").on(table.expireAt)
}));

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  username: text("username"),
  action: text("action").notNull(),
  result: text("result").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  riskLevel: text("risk_level").notNull().default("low"),
  detail: text("detail"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  auditLogsUserIdx: index("audit_logs_user_idx").on(table.userId),
  auditLogsActionIdx: index("audit_logs_action_idx").on(table.action),
  auditLogsCreatedIdx: index("audit_logs_created_idx").on(table.createdAt)
}));

export const logs = sqliteTable("logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  logUid: text("log_uid").notNull().unique(),
  type: text("type", { enum: ["login_log", "operation_log", "security_log", "error_log", "document_log"] }).notNull(),
  userId: integer("user_id").references(() => users.id),
  role: text("role"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  docUid: text("doc_uid"),
  ownerId: integer("owner_id"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  path: text("path"),
  method: text("method"),
  statusCode: integer("status_code"),
  message: text("message"),
  data: text("data"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  logsTypeCreatedIdx: index("logs_type_created_idx").on(table.type, table.createdAt),
  logsUserCreatedIdx: index("logs_user_created_idx").on(table.userId, table.createdAt),
  logsActionCreatedIdx: index("logs_action_created_idx").on(table.action, table.createdAt),
  logsDocUidIdx: index("logs_doc_uid_idx").on(table.docUid),
  logsCreatedIdx: index("logs_created_idx").on(table.createdAt)
}));

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  type: text("type", { enum: ["string", "json", "number", "boolean"] }).notNull().default("string"),
  encrypted: integer("encrypted", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const operationLogs = sqliteTable("operation_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  opTargetIdx: index("operation_logs_target_idx").on(table.targetType, table.targetId),
  opUserIdx: index("operation_logs_user_idx").on(table.userId),
  opCreatedIdx: index("operation_logs_created_idx").on(table.createdAt)
}));

export const uniqueShareCode = uniqueIndex("shares_share_code_unique").on(shares.shareCode);

// ===== 收集表模块 =====
export const forms = sqliteTable("forms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formUid: text("form_uid").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  fields: text("fields").notNull(),  // JSON: FormField[]
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["draft", "published", "closed"] }).notNull().default("draft"),
  maxSubmissions: integer("max_submissions"),
  allowMultiple: integer("allow_multiple", { mode: "boolean" }).notNull().default(false),
  exclusiveInfo: text("exclusive_info"),  // JSON: 提交后展示给填写者的专属信息
  privacyNotice: text("privacy_notice"),
  retentionDays: integer("retention_days"),
  storeUserAgent: integer("store_user_agent", { mode: "boolean" }).notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  submissionCount: integer("submission_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  formUidUnique: uniqueIndex("uk_forms_form_uid").on(table.formUid),
  formOwnerIdx: index("forms_owner_idx").on(table.ownerId),
  formStatusIdx: index("forms_status_idx").on(table.status)
}));

export const formSubmissions = sqliteTable("form_submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formId: integer("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  data: text("data").notNull(),  // JSON: 提交的数据
  ip: text("ip").notNull(), // 不存原始 IP，只存不可逆来源摘要
  submitterId: text("submitter_id"),
  userAgent: text("user_agent"),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  submissionFormIdx: index("form_submissions_form_idx").on(table.formId),
  submissionIdentityIdx: uniqueIndex("form_submissions_identity_unique").on(table.formId, table.submitterId),
  submissionIpIdx: index("form_submissions_ip_idx").on(table.ip),
  submissionTimeIdx: index("form_submissions_time_idx").on(table.submittedAt)
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ===== 标签模块 =====
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  ownerId: integer("owner_id").references(() => users.id, { onDelete: "cascade" }),
  docCount: integer("doc_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  nameOwnerUnique: uniqueIndex("uk_tags_name_owner").on(table.name, table.ownerId),
  ownerIdx: index("tags_owner_idx").on(table.ownerId)
}));

// ===== 模板模块 =====
export const templates = sqliteTable("templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  templateUid: text("template_uid").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  html: text("html").notNull().default(""),
  contentJson: text("content_json").notNull().default(""),
  sort: integer("sort").notNull().default(0),
  tags: text("tags").notNull().default("[]"),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  nameOwnerUnique: uniqueIndex("uk_templates_name_owner").on(table.title, table.ownerId),
  ownerIdx: index("templates_owner_idx").on(table.ownerId)
}));

// ===== 访问统计模块 =====
export const accessLogs = sqliteTable("access_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  targetType: text("target_type", { enum: ["doc", "form"] }).notNull(),
  targetId: integer("target_id").notNull(),
  visitorHash: text("visitor_hash"),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  device: text("device"),
  viewedAt: integer("viewed_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  targetIdx: index("access_logs_target_idx").on(table.targetType, table.targetId),
  ipHashIdx: index("access_logs_ip_hash_idx").on(table.ipHash),
  timeIdx: index("access_logs_time_idx").on(table.viewedAt)
}));

// ===== JWT 密钥模块 =====
export const jwtKeys = sqliteTable("jwt_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keyId: text("key_id").notNull().unique(),
  secret: text("secret").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" })
}, (table) => ({
  keyIdUnique: uniqueIndex("uk_jwt_keys_key_id").on(table.keyId),
  activeIdx: index("jwt_keys_active_idx").on(table.isActive)
}));

// ===== TOTP 失败记录模块 =====
export const totpFailures = sqliteTable("totp_failures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dimension: text("dimension", { enum: ["account", "ip"] }).notNull(),
  dimensionValue: text("dimension_value").notNull(),
  failCount: integer("fail_count").notNull().default(1),
  firstFailedAt: integer("first_failed_at", { mode: "timestamp_ms" }).notNull(),
  lastFailedAt: integer("last_failed_at", { mode: "timestamp_ms" }).notNull(),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" })
}, (table) => ({
  userIdx: index("totp_failures_user_idx").on(table.userId),
  timeIdx: index("totp_failures_time_idx").on(table.lastFailedAt)
}));

// ===== 搜索历史模块 =====
export const searchHistory = sqliteTable("search_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  query: text("query").notNull(),
  queryHash: text("query_hash").notNull(),
  searchMode: text("search_mode", { enum: ["fulltext", "quick", "suggestions"] }).notNull().default("fulltext"),
  resultCount: integer("result_count").notNull().default(0),
  searchTime: integer("search_time").notNull().default(0),
  ipHash: text("ip_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  userIdx: index("search_history_user_idx").on(table.userId),
  queryHashIdx: index("search_history_query_hash_idx").on(table.queryHash),
  createdIdx: index("search_history_created_idx").on(table.createdAt),
  userQueryUnique: uniqueIndex("uk_search_history_user_query").on(table.userId, table.queryHash)
}));
