import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, dbAll } from "../../db/client.js";
import { docs, docVersions, shares } from "../../db/schema.js";
export { docs, docVersions, shares };

export async function getDocsForExport(actor: {
  id: number;
  role: string;
  isSuperAdmin?: boolean;
}, docIds: number[]) {
  if (docIds.length === 0) return [];

  const uniqueIds = [...new Set(docIds)].slice(0, 100);
  const accessWhere = actor.isSuperAdmin
    ? inArray(docs.id, uniqueIds)
    : and(inArray(docs.id, uniqueIds), sql`${docs.ownerId} = ${actor.id}`);

  return dbAll(
    db.select({
      id: docs.id,
      docUid: docs.docUid,
      title: docs.title,
      summary: docs.summary,
      contentJsonCiphertext: docs.contentJsonCiphertext,
      contentJsonIv: docs.contentJsonIv,
      contentJsonTag: docs.contentJsonTag,
      contentJsonKeyVersion: docs.contentJsonKeyVersion,
      contentHtmlCiphertext: docs.contentHtmlCiphertext,
      contentHtmlIv: docs.contentHtmlIv,
      contentHtmlTag: docs.contentHtmlTag,
      contentHtmlKeyVersion: docs.contentHtmlKeyVersion,
      tags: docs.tags,
      createdAt: docs.createdAt,
      updatedAt: docs.updatedAt,
    })
      .from(docs)
      .where(and(accessWhere, sql`${docs.deletedAt} IS NULL`))
      .orderBy(desc(docs.updatedAt))
  );
}

export async function getDocForExportByUid(actor: {
  id: number;
  role: string;
  isSuperAdmin?: boolean;
}, docUid: string) {
  const accessWhere = actor.isSuperAdmin
    ? sql`1=1`
    : sql`${docs.ownerId} = ${actor.id}`;

  return dbAll(
    db.select({
      id: docs.id,
      docUid: docs.docUid,
      title: docs.title,
      summary: docs.summary,
      contentJsonCiphertext: docs.contentJsonCiphertext,
      contentJsonIv: docs.contentJsonIv,
      contentJsonTag: docs.contentJsonTag,
      contentJsonKeyVersion: docs.contentJsonKeyVersion,
      contentHtmlCiphertext: docs.contentHtmlCiphertext,
      contentHtmlIv: docs.contentHtmlIv,
      contentHtmlTag: docs.contentHtmlTag,
      contentHtmlKeyVersion: docs.contentHtmlKeyVersion,
      tags: docs.tags,
      createdAt: docs.createdAt,
      updatedAt: docs.updatedAt,
    })
      .from(docs)
      .where(and(eq(docs.docUid, docUid), accessWhere, sql`${docs.deletedAt} IS NULL`))
      .limit(1)
  );
}
