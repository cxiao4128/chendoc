import { boolean, datetime, index, int, mediumtext, mysqlTable, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

const id = (name = "id") => int(name).autoincrement().primaryKey();
const ts = (name: string) => datetime(name, { mode: "date", fsp: 3 });

export const users = mysqlTable("users", {
  id: id(),
  username: varchar("username", { length: 191 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 16 }).notNull().default("user"),
  status: varchar("status", { length: 16 }).notNull().default("active"),
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
  userId: int("user_id").notNull(),
  keyEncrypted: text("key_encrypted").notNull(),
  expireAt: ts("expire_at").notNull(),
  createdAt: ts("created_at").notNull()
}, (table) => [
  index("auth_sessions_user_idx").on(table.userId),
  index("auth_sessions_expire_idx").on(table.expireAt)
]);

export const spaces = mysqlTable("spaces", {
  id: id(),
  name: varchar("name", { length: 191 }).notNull(),
  description: text("description"),
  ownerId: int("owner_id"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
});

export const docs = mysqlTable("docs", {
  id: id(),
  spaceId: int("space_id"),
  parentId: int("parent_id"),
  title: varchar("title", { length: 191 }).notNull(),
  contentJson: mediumtext("content_json").notNull(),
  contentHtml: mediumtext("content_html").notNull(),
  coverUrl: text("cover_url"),
  summary: text("summary"),
  tags: text("tags").notNull().default("[]"),
  pinned: boolean("pinned").notNull().default(false),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  sort: int("sort").notNull().default(0),
  createdBy: int("created_by"),
  updatedBy: int("updated_by"),
  deletedAt: ts("deleted_at"),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
}, (table) => [
  index("docs_parent_idx").on(table.parentId),
  index("docs_deleted_idx").on(table.deletedAt),
  index("docs_space_idx").on(table.spaceId),
  index("docs_pinned_idx").on(table.pinned),
  index("docs_updated_idx").on(table.updatedAt)
]);

export const shares = mysqlTable("shares", {
  id: id(),
  docId: int("doc_id").notNull(),
  shareCode: int("share_code").notNull().unique(),
  customSlug: varchar("custom_slug", { length: 191 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  isEnabled: boolean("is_enabled").notNull().default(true),
  reviewStatus: varchar("review_status", { length: 16 }).notNull().default("approved"),
  reviewNote: text("review_note"),
  reviewContentHash: varchar("review_content_hash", { length: 128 }),
  requestedBy: int("requested_by"),
  reviewedBy: int("reviewed_by"),
  reviewedAt: ts("reviewed_at"),
  expireAt: ts("expire_at"),
  viewCount: int("view_count").notNull().default(0),
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull()
}, (table) => [
  index("shares_doc_idx").on(table.docId)
]);

export const uploads = mysqlTable("uploads", {
  id: id(),
  userId: int("user_id"),
  docId: int("doc_id"),
  objectKey: varchar("object_key", { length: 191 }).notNull().unique(),
  publicUrl: text("public_url").notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  fileSize: int("file_size").notNull(),
  kind: varchar("kind", { length: 16 }).notNull(),
  originalName: varchar("original_name", { length: 255 }),
  createdAt: ts("created_at").notNull()
});

export const docVersions = mysqlTable("doc_versions", {
  id: id(),
  docId: int("doc_id").notNull(),
  title: varchar("title", { length: 191 }).notNull(),
  contentJson: mediumtext("content_json").notNull(),
  contentHtml: mediumtext("content_html").notNull(),
  createdBy: int("created_by"),
  createdAt: ts("created_at").notNull()
}, (table) => [
  index("doc_versions_doc_created_idx").on(table.docId, table.createdAt)
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
  index("operation_logs_user_idx").on(table.userId)
]);

export const uniqueShareCode = uniqueIndex("shares_share_code_unique").on(shares.shareCode);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
