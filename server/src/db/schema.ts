import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
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
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
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
  spaceId: integer("space_id").references(() => spaces.id),
  parentId: integer("parent_id"),
  title: text("title").notNull(),
  contentJson: text("content_json").notNull().default("{}"),
  contentHtml: text("content_html").notNull().default(""),
  coverUrl: text("cover_url"),
  summary: text("summary"),
  tags: text("tags").notNull().default("[]"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  sort: integer("sort").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  docParentIdx: index("docs_parent_idx").on(table.parentId),
  docDeletedIdx: index("docs_deleted_idx").on(table.deletedAt),
  docSpaceIdx: index("docs_space_idx").on(table.spaceId),
  docPinnedIdx: index("docs_pinned_idx").on(table.pinned),
  docUpdatedIdx: index("docs_updated_idx").on(table.updatedAt)
}));

export const shares = sqliteTable("shares", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docId: integer("doc_id").notNull().references(() => docs.id),
  shareCode: integer("share_code").notNull().unique(),
  customSlug: text("custom_slug").unique(),
  passwordHash: text("password_hash"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  reviewStatus: text("review_status", { enum: ["pending", "approved", "rejected"] }).notNull().default("approved"),
  reviewNote: text("review_note"),
  reviewContentHash: text("review_content_hash"),
  requestedBy: integer("requested_by").references(() => users.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  expireAt: integer("expire_at", { mode: "timestamp_ms" }),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  shareDocIdx: index("shares_doc_idx").on(table.docId)
}));

export const uploads = sqliteTable("uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  docId: integer("doc_id").references(() => docs.id),
  objectKey: text("object_key").notNull().unique(),
  publicUrl: text("public_url").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  kind: text("kind", { enum: ["image", "video", "file"] }).notNull(),
  originalName: text("original_name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const docVersions = sqliteTable("doc_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docId: integer("doc_id").notNull().references(() => docs.id),
  title: text("title").notNull(),
  contentJson: text("content_json").notNull(),
  contentHtml: text("content_html").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
}, (table) => ({
  docVersionsDocCreatedIdx: index("doc_versions_doc_created_idx").on(table.docId, table.createdAt)
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
  opUserIdx: index("operation_logs_user_idx").on(table.userId)
}));

export const uniqueShareCode = uniqueIndex("shares_share_code_unique").on(shares.shareCode);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
