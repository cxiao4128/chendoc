import { eq } from "drizzle-orm";
import { closeDatabase, db, dbAll, dbRun } from "../db/client.js";
import { docs, docVersions } from "../db/schema.js";
import { renderStoredDocumentHtml } from "../utils/sanitize.js";
import { now } from "../utils/date.js";
import { decryptDocumentRecord, encryptDocumentContent } from "../utils/documentCrypto.js";

function cleanedHtml(row: { contentJson?: string | null; contentHtml: string }) {
  return renderStoredDocumentHtml(row.contentJson, row.contentHtml);
}

async function resanitizeDocs() {
  let changed = 0;
  const rows = await dbAll<typeof docs.$inferSelect>(db.select().from(docs));

  for (const row of rows) {
    const decrypted = decryptDocumentRecord(row);
    const next = cleanedHtml(decrypted);
    if (next === decrypted.contentHtml) continue;
    await dbRun(db.update(docs).set({
      ...encryptDocumentContent(decrypted.contentJson, next),
      updatedAt: now()
    }).where(eq(docs.id, row.id)));
    changed += 1;
  }
  return changed;
}

async function resanitizeVersions() {
  let changed = 0;
  const rows = await dbAll<typeof docVersions.$inferSelect>(db.select().from(docVersions));

  for (const row of rows) {
    const decrypted = decryptDocumentRecord(row);
    const next = cleanedHtml(decrypted);
    if (next === decrypted.contentHtml) continue;
    await dbRun(db.update(docVersions).set(encryptDocumentContent(decrypted.contentJson, next)).where(eq(docVersions.id, row.id)));
    changed += 1;
  }
  return changed;
}

async function main() {
  const [docCount, versionCount] = await Promise.all([resanitizeDocs(), resanitizeVersions()]);
  console.log(`HTML re-sanitize completed. docs=${docCount}, versions=${versionCount}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "HTML re-sanitize failed.");
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
