import { CopyObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const { assertR2Ready } = await import("../server/dist/modules/settings/settings.service.js");
const { createR2Client } = await import("../server/dist/config/r2.js");
const { closeDatabase } = await import("../server/dist/db/client.js");
const config = await assertR2Ready();
const sourceBucket = config.bucket;
const backupBucket = process.env.R2_BACKUP_BUCKET?.trim();
if (!backupBucket) {
  console.log("R2 backup skipped: R2_BACKUP_BUCKET is not configured.");
  await closeDatabase();
  process.exit(0);
}
if (sourceBucket === backupBucket) throw new Error("R2_BACKUP_BUCKET must differ from R2_BUCKET.");

const client = createR2Client(config);

let token;
let copied = 0;
do {
  const page = await client.send(new ListObjectsV2Command({ Bucket: sourceBucket, ContinuationToken: token }));
  for (const object of page.Contents ?? []) {
    if (!object.Key) continue;
    await client.send(new CopyObjectCommand({
      Bucket: backupBucket,
      Key: object.Key,
      CopySource: `${sourceBucket}/${encodeURIComponent(object.Key).replace(/%2F/g, "/")}`
    }));
    copied += 1;
  }
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

console.log(`R2 backup complete: copied=${copied}, target=${backupBucket}`);
await closeDatabase();
