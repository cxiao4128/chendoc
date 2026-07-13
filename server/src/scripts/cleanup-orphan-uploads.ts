import { DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { createR2Client } from "../config/r2.js";
import { closeDatabase, db, dbAll, dbGet, dbRun } from "../db/client.js";
import { settings, uploads } from "../db/schema.js";
import { env } from "../config/env.js";
import { assertR2Ready } from "../modules/settings/storage.service.js";

const cutoff = new Date(Date.now() - env.uploadOrphanRetentionHours * 60 * 60 * 1000);
const SCAN_CURSOR_KEY = "maintenance.upload_cleanup_cursor";
const MAX_SCAN_PAGES = 5;

try {
  const config = await assertR2Ready();
  const client = createR2Client(config);
  const staleRows = await dbAll<typeof uploads.$inferSelect>(db.select().from(uploads).where(and(
    isNull(uploads.docId),
    or(lt(uploads.detachedAt, cutoff), and(isNull(uploads.detachedAt), lt(uploads.createdAt, cutoff)))
  )));
  for (const row of staleRows) {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: row.objectKey }));
    await dbRun(db.delete(uploads).where(eq(uploads.id, row.id)));
  }

  const cursor = await dbGet<{ value: string }>(db.select({ value: settings.value }).from(settings).where(eq(settings.key, SCAN_CURSOR_KEY)).limit(1));
  let token: string | undefined = cursor?.value || undefined;
  let untrackedDeleted = 0;
  let scannedPages = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: "docs/", ContinuationToken: token, MaxKeys: 1000 }));
    const objectKeys = (page.Contents ?? []).flatMap((object) => object.Key ? [object.Key] : []);
    const tracked = new Set(objectKeys.length
      ? (await dbAll<{ objectKey: string }>(db.select({ objectKey: uploads.objectKey }).from(uploads).where(inArray(uploads.objectKey, objectKeys)))).map((row) => row.objectKey)
      : []);
    for (const object of page.Contents ?? []) {
      if (object.Key && object.LastModified && object.LastModified < cutoff && !tracked.has(object.Key)) {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: object.Key }));
        untrackedDeleted += 1;
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    scannedPages += 1;
  } while (token && scannedPages < MAX_SCAN_PAGES);

  if (token) {
    const timestamp = new Date();
    if (cursor) {
      await dbRun(db.update(settings).set({ value: token, updatedAt: timestamp }).where(eq(settings.key, SCAN_CURSOR_KEY)));
    } else {
      await dbRun(db.insert(settings).values({
        key: SCAN_CURSOR_KEY,
        value: token,
        type: "string",
        encrypted: false,
        createdAt: timestamp,
        updatedAt: timestamp
      }));
    }
  } else {
    await dbRun(db.delete(settings).where(eq(settings.key, SCAN_CURSOR_KEY)));
  }

  console.log(`Upload cleanup: detached=${staleRows.length}, untracked=${untrackedDeleted}, scannedPages=${scannedPages}, continued=${Boolean(token)}`);
} finally {
  await closeDatabase();
}
