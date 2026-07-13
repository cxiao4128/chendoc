// Core settings service - basic key-value store

import { listSettings as listSettingsFromRepo, upsertSetting } from "./core.repo.js";
import { decryptValue, encryptValue } from "../../utils/crypto.js";
import { env } from "../../config/env.js";
import { maskSecret } from "../../utils/maskSecret.js";
import { now } from "../../utils/date.js";
import type { SettingRow, SettingType } from "./types.js";
import { dbTransaction } from "../../db/client.js";

const sensitiveKeys = new Set(["r2.access_key_id", "r2.secret_access_key"]);

export async function setSetting(key: string, value: string, type: SettingType = "string") {
  const createdAt = now();
  const encrypted = sensitiveKeys.has(key);
  const stored = encrypted ? encryptValue(value, env.configEncryptionKey) : value;
  await upsertSetting(key, stored, type, encrypted, createdAt);
}

export async function setSettings(items: Array<{ key: string; value: string; type?: SettingType }>) {
  const prepared = items.map(({ key, value, type = "string" }) => {
    const encrypted = sensitiveKeys.has(key);
    return {
      key,
      value: encrypted ? encryptValue(value, env.configEncryptionKey) : value,
      type,
      encrypted
    };
  });
  const updatedAt = now();
  await dbTransaction(async (tx) => {
    for (const item of prepared) {
      await upsertSetting(item.key, item.value, item.type, item.encrypted, updatedAt, tx);
    }
  });
}

export async function listSettings(mask = true): Promise<SettingRow[]> {
  const rows = await listSettingsFromRepo();
  return rows.map((row) => ({
    key: row.key,
    value: row.encrypted
      ? mask
        ? maskSecret(decryptValue(row.value, env.configEncryptionKey))
        : decryptValue(row.value, env.configEncryptionKey)
      : row.value,
    type: row.type as SettingType,
    encrypted: row.encrypted,
    updatedAt: row.updatedAt
  }));
}
