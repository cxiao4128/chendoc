import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { docs, tagHierarchy, tags } from "../../db/schema.js";
export { docs, tagHierarchy, tags };

export async function listTags(ownerId: number) {
  return dbAll(db.select().from(tags).where(eq(tags.ownerId, ownerId)).orderBy(desc(tags.docCount), tags.name));
}

export async function getTag(id: number, ownerId: number) {
  return dbGet(db.select().from(tags).where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))).limit(1));
}

export async function getTagByName(name: string, ownerId: number) {
  return dbGet(db.select().from(tags).where(and(eq(tags.name, name), eq(tags.ownerId, ownerId))).limit(1));
}

export async function insertTag(values: {
  name: string;
  color: string;
  parentId: number | null;
  ownerId: number;
  docCount: number;
  createdAt: Date;
}) {
  const result = await dbRun(db.insert(tags).values(values));
  const created = await dbGet<typeof tags.$inferSelect>(
    db.select().from(tags).where(eq(tags.id, Number(result.lastInsertRowid))).limit(1)
  );
  if (!created) throw new Error("Tag creation failed.");
  return created;
}

export async function updateTag(id: number, values: Record<string, unknown>) {
  const result = await dbRun(db.update(tags).set(values).where(eq(tags.id, id)));
  if (result.changes !== 1) return undefined;
  return dbGet<typeof tags.$inferSelect>(db.select().from(tags).where(eq(tags.id, id)).limit(1));
}

export async function updateTagByIdOwner(id: number, ownerId: number, values: Record<string, unknown>) {
  const result = await dbRun(db.update(tags).set(values).where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))));
  if (result.changes !== 1) return undefined;
  return dbGet<typeof tags.$inferSelect>(
    db.select().from(tags).where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))).limit(1)
  );
}

export async function deleteTag(id: number, ownerId: number) {
  const result = await dbRun(db.delete(tags).where(and(eq(tags.id, id), eq(tags.ownerId, ownerId))));
  return result.changes > 0;
}

export async function getChildrenOfTag(parentId: number, ownerId: number) {
  return dbAll(db.select({ id: tags.id }).from(tags).where(and(eq(tags.parentId, parentId), eq(tags.ownerId, ownerId))));
}

export async function promoteChildrenToRoot(parentId: number, ownerId: number) {
  await db.update(tags).set({ parentId: null }).where(and(eq(tags.parentId, parentId), eq(tags.ownerId, ownerId))).execute();
}

export async function deleteTagHierarchy(tagId: number) {
  await db.delete(tagHierarchy).where(or(eq(tagHierarchy.parentTagId, tagId), eq(tagHierarchy.childTagId, tagId))).execute();
}

export async function getTagsByIds(ids: number[], ownerId: number) {
  return dbAll(db.select({ id: tags.id, name: tags.name }).from(tags).where(and(inArray(tags.id, ids), eq(tags.ownerId, ownerId))));
}

export async function getDocsWithTags(ownerId: number) {
  return dbAll(db.select({ id: docs.id, tags: docs.tags }).from(docs).where(eq(docs.ownerId, ownerId)));
}

export async function updateDocTags(docId: number, tagsJson: string) {
  await db.update(docs).set({ tags: tagsJson }).where(eq(docs.id, docId)).execute();
}

export async function getTagChildrenForMerge(tagId: number, ownerId: number) {
  return dbAll(db.select({ id: tags.id, name: tags.name }).from(tags).where(and(eq(tags.parentId, tagId), eq(tags.ownerId, ownerId))));
}

export async function updateTagDocCount(tagId: number, ownerId: number, docCount: number) {
  await db.update(tags).set({ docCount }).where(and(eq(tags.id, tagId), eq(tags.ownerId, ownerId))).execute();
}
