import { and, eq, isNull, ne } from "drizzle-orm";
import { closeDatabase, db, dbAll, dbRun } from "../db/client.js";
import { docs, docVersions } from "../db/schema.js";
import { decryptDocumentRecord, encryptDocumentContent } from "../utils/documentCrypto.js";
import { env } from "../config/env.js";

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

async function rotateDocs() {
  const rows = await dbAll<typeof docs.$inferSelect>(db.select().from(docs));
  let changed = 0;
  for (const row of rows) {
    if (!row.contentJsonCiphertext || row.contentJsonKeyVersion === env.documentKeyVersion) continue;
    const plain = decryptDocumentRecord(row);
    await dbRun(db.update(docs).set(encryptDocumentContent(plain.contentJson, plain.contentHtml)).where(eq(docs.id, row.id)));
    changed += 1;
  }
  return changed;
}

async function rotateVersions() {
  const rows = await dbAll<typeof docVersions.$inferSelect>(db.select().from(docVersions));
  let changed = 0;
  for (const row of rows) {
    if (!row.contentJsonCiphertext || row.contentJsonKeyVersion === env.documentKeyVersion) continue;
    const plain = decryptDocumentRecord(row);
    await dbRun(db.update(docVersions).set(encryptDocumentContent(plain.contentJson, plain.contentHtml)).where(eq(docVersions.id, row.id)));
    changed += 1;
  }
  return changed;
}

try {
  const docCount = await encryptDocs();
  const versionCount = await encryptVersions();
  const rotatedDocs = await rotateDocs();
  const rotatedVersions = await rotateVersions();
  console.log(`Encrypted docs=${docCount}, versions=${versionCount}, rotated_docs=${rotatedDocs}, rotated_versions=${rotatedVersions}`);
} finally {
  await closeDatabase();
}
