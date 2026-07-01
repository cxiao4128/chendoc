import { env } from "../config/env.js";
import * as mysqlSchema from "./schema.mysql.js";
import * as sqliteSchema from "./schema.sqlite.js";

const activeSchema = env.databaseProvider === "mysql"
  ? mysqlSchema
  : sqliteSchema;

export const users = activeSchema.users as typeof sqliteSchema.users;
export const invites = activeSchema.invites as typeof sqliteSchema.invites;
export const captchas = activeSchema.captchas as typeof sqliteSchema.captchas;
export const cryptoKeys = activeSchema.cryptoKeys as typeof sqliteSchema.cryptoKeys;
export const authSessions = activeSchema.authSessions as typeof sqliteSchema.authSessions;
export const spaces = activeSchema.spaces as typeof sqliteSchema.spaces;
export const docs = activeSchema.docs as typeof sqliteSchema.docs;
export const shares = activeSchema.shares as typeof sqliteSchema.shares;
export const uploads = activeSchema.uploads as typeof sqliteSchema.uploads;
export const docVersions = activeSchema.docVersions as typeof sqliteSchema.docVersions;
export const settings = activeSchema.settings as typeof sqliteSchema.settings;
export const operationLogs = activeSchema.operationLogs as typeof sqliteSchema.operationLogs;
export const loginFailures = activeSchema.loginFailures as typeof sqliteSchema.loginFailures;
export const dangerVerifications = activeSchema.dangerVerifications as typeof sqliteSchema.dangerVerifications;
export const auditLogs = activeSchema.auditLogs as typeof sqliteSchema.auditLogs;
export const logs = activeSchema.logs as typeof sqliteSchema.logs;
export const uniqueShareCode = activeSchema.uniqueShareCode as typeof sqliteSchema.uniqueShareCode;
export const forms = activeSchema.forms as typeof sqliteSchema.forms;
export const formSubmissions = activeSchema.formSubmissions as typeof sqliteSchema.formSubmissions;
export const tags = activeSchema.tags as typeof sqliteSchema.tags;
export const tagHierarchy = activeSchema.tagHierarchy as typeof sqliteSchema.tagHierarchy;
export const docComments = activeSchema.docComments as typeof sqliteSchema.docComments;
export const docCommentReactions = activeSchema.docCommentReactions as typeof sqliteSchema.docCommentReactions;
export const templates = activeSchema.templates as typeof sqliteSchema.templates;
export const accessLogs = activeSchema.accessLogs as typeof sqliteSchema.accessLogs;
export const jwtKeys = activeSchema.jwtKeys as typeof sqliteSchema.jwtKeys;
export const totpFailures = activeSchema.totpFailures as typeof sqliteSchema.totpFailures;
export const searchHistory = activeSchema.searchHistory as typeof sqliteSchema.searchHistory;

export type User = typeof sqliteSchema.users.$inferSelect;
export type NewUser = typeof sqliteSchema.users.$inferInsert;
