/**
 * spaces.repo.ts
 *
 * 空间模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑、权限检查。
 */

import { and, eq, sql } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { spaces } from "../../db/schema.js";
export { spaces };

export async function listSpaces(where?: any) {
  const query = db.select().from(spaces);
  return dbAll<typeof spaces.$inferSelect>(where ? query.where(where) : query);
}

export async function getSpaceById(id: number) {
  return dbGet<typeof spaces.$inferSelect>(db.select().from(spaces).where(eq(spaces.id, id)).limit(1));
}

export async function insertSpace(values: {
  name: string;
  description: string | null;
  ownerId: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  const result = await dbRun(db.insert(spaces).values(values));
  return { id: Number(result.lastInsertRowid) };
}

export async function updateSpaceById(id: number, patch: Partial<typeof spaces.$inferInsert>, ownerId?: number) {
  const where = ownerId === undefined
    ? eq(spaces.id, id)
    : and(eq(spaces.id, id), eq(spaces.ownerId, ownerId));
  const result = await dbRun(db.update(spaces).set(patch).where(where));
  return result;
}

export async function deleteSpaceById(id: number, ownerId?: number) {
  const where = ownerId === undefined
    ? eq(spaces.id, id)
    : and(eq(spaces.id, id), eq(spaces.ownerId, ownerId));
  const result = await dbRun(db.delete(spaces).where(where));
  return result;
}

export async function getSpaceCountByOwner(ownerId: number) {
  const r = await dbGet<{ count: number }>(
    db.select({ count: sql<number>`count(*)` }).from(spaces).where(eq(spaces.ownerId, ownerId))
  );
  return r?.count ?? 0;
}
