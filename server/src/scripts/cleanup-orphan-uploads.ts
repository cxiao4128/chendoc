import { DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { and, eq, isNull, lt } from "drizzle-orm";
import { createR2Client } from "../config/r2.js";
import { closeDatabase, db, dbAll, dbRun } from "../db/client.js";
import { uploads } from "../db/schema.js";
import { env } from "../config/env.js";
import { assertR2Ready } from "../modules/settings/settings.service.js";

const cutoff = new Date(Date.now() - env.uploadOrphanRetentionHours * 60 * 60 * 1000);

try {
  const config = await assertR2Ready();
  const client = createR2Client(config);
  const staleRows = await dbAll<typeof uploads.$inferSelect>(db.select().from(uploads).where(and(
    isNull(uploads.docId),
    lt(uploads.createdAt, cutoff)
  )));
  for (const row of staleRows) {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: row.objectKey }));
    await dbRun(db.delete(uploads).where(eq(uploads.id, row.id)));
  }

  const tracked = new Set((await dbAll<{ objectKey: string }>(db.select({ objectKey: uploads.objectKey }).from(uploads))).map((row) => row.objectKey));
  let token: string | undefined;
  let untrackedDeleted = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: "docs/", ContinuationToken: token }));
    for (const object of page.Contents ?? []) {
      if (object.Key && object.LastModified && object.LastModified < cutoff && !tracked.has(object.Key)) {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: object.Key }));
        untrackedDeleted += 1;
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  console.log(`Upload cleanup: detached=${staleRows.length}, untracked=${untrackedDeleted}`);
} finally {
  await closeDatabase();
}
