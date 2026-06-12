import { and, eq, isNull, ne } from "drizzle-orm";
import { closeDatabase, db, dbAll, dbRun } from "../db/client.js";
import { docs, docVersions } from "../db/schema.js";
import { encryptDocumentContent } from "../utils/documentCrypto.js";

async function encryptDocs() {
  const rows = await dbAll<typeof docs.$inferSelect>(db
    .select()
    .from(docs)
    .where(and(isNull(docs.contentJsonCiphertext), ne(docs.contentJson, ""))));
  for (const row of rows) {
    await dbRun(db.update(docs).set(encryptDocumentContent(row.contentJson, row.contentHtml)).where(eq(docs.id, row.id)));
  }
  return rows.length;
}

async function encryptVersions() {
  const rows = await dbAll<typeof docVersions.$inferSelect>(db
    .select()
    .from(docVersions)
    .where(and(isNull(docVersions.contentJsonCiphertext), ne(docVersions.contentJson, ""))));
  for (const row of rows) {
    await dbRun(db.update(docVersions).set(encryptDocumentContent(row.contentJson, row.contentHtml)).where(eq(docVersions.id, row.id)));
  }
  return rows.length;
}

try {
  const docCount = await encryptDocs();
  const versionCount = await encryptVersions();
  console.log(`Encrypted docs=${docCount}, versions=${versionCount}`);
} finally {
  await closeDatabase();
}
