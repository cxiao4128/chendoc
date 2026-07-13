// Core repository - shared DB helper functions for settings sub-modules

import { eq, inArray, like } from "drizzle-orm";
import { databaseProvider, db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { settings } from "../../db/schema.js";
export { settings };

import { decryptValue } from "../../utils/crypto.js";
import { env } from "../../config/env.js";
import { now } from "../../utils/date.js";

function decodeSettingRow(row: typeof settings.$inferSelect): string {
  return row.encrypted ? decryptValue(row.value, env.configEncryptionKey) : row.value;
}

export async function getSettingByKey(key: string) {
  return dbGet<typeof settings.$inferSelect>(db.select().from(settings).where(eq(settings.key, key)).limit(1));
}

export async function listSettings() {
  return dbAll(db.select().from(settings).orderBy(settings.key));
}

export async function upsertSetting(key: string, value: string, type: string, encrypted: boolean, updatedAt?: Date, executor: any = db) {
  const ts = updatedAt ?? now();
  const insert = executor.insert(settings).values({ key, value, type, encrypted, createdAt: ts, updatedAt: ts });
  const query = databaseProvider === "mysql"
    ? insert.onDuplicateKeyUpdate({ value, type, encrypted, updatedAt: ts })
    : insert.onConflictDoUpdate({
        target: settings.key,
        set: { value, type, encrypted, updatedAt: ts }
      });
  await dbRun(query);
}

export async function deleteSetting(key: string) {
  await dbRun(db.delete(settings).where(eq(settings.key, key)));
}

export async function listSettingsByPrefix(prefix: string) {
  return dbAll(db.select().from(settings).where(like(settings.key, `${prefix}%`)).orderBy(settings.key));
}

export async function getSettingsMap(keys: string[]) {
  if (keys.length === 0) return new Map<string, typeof settings.$inferSelect>();
  const results = await dbAll(db.select().from(settings).where(inArray(settings.key, keys)));
  const map = new Map<string, typeof settings.$inferSelect>();
  for (const r of results) map.set(r.key, r);
  return map;
}

export async function settingValue(key: string, fallback = ""): Promise<string> {
  const row = await getSettingByKey(key);
  if (!row) return fallback;
  return decodeSettingRow(row);
}

export async function settingBooleanValue(key: string, fallback = false): Promise<boolean> {
  const value = (await settingValue(key, fallback ? "true" : "false")).trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

export async function settingValues(keys: string[]): Promise<Map<string, string>> {
  if (!keys.length) return new Map<string, string>();
  const rows = await dbAll<typeof settings.$inferSelect>(db.select().from(settings).where(inArray(settings.key, keys)));
  return new Map(rows.map((row) => [row.key, decodeSettingRow(row)]));
}

export function valueFromSettings(values: Map<string, string>, key: string, fallback = ""): string {
  return values.get(key) ?? fallback;
}

export function booleanFromSettings(values: Map<string, string>, key: string, fallback = false): boolean {
  const value = valueFromSettings(values, key, fallback ? "true" : "false").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}
