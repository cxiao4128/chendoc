/**
 * invites.repo.ts
 *
 * 邀请模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑、权限检查。
 */

import { and, desc, eq, lte } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { invites, users } from "../../db/schema.js";
export { invites, users };

export async function listInvites() {
  return dbAll(
    db.select({
      id: invites.id,
      code: invites.code,
      status: invites.status,
      createdBy: invites.createdBy,
      usedBy: invites.usedBy,
      usedByUsername: users.username,
      usedAt: invites.usedAt,
      expireAt: invites.expireAt,
      createdAt: invites.createdAt,
      updatedAt: invites.updatedAt
    })
      .from(invites)
      .leftJoin(users, eq(invites.usedBy, users.id))
      .orderBy(desc(invites.createdAt))
  );
}

export async function getInviteByCode(code: string) {
  return dbGet<typeof invites.$inferSelect>(db.select().from(invites).where(eq(invites.code, code)).limit(1));
}

export async function getInviteById(id: number) {
  return dbGet<typeof invites.$inferSelect>(db.select().from(invites).where(eq(invites.id, id)).limit(1));
}

export async function inviteCodeExists(code: string, executor: any = db) {
  const existing = await dbGet<{ id: number }>(executor.select({ id: invites.id }).from(invites).where(eq(invites.code, code)).limit(1));
  return !!existing;
}

export async function insertInvite(values: {
  code: string;
  status: string;
  createdBy: number;
  expireAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}, executor: any = db) {
  const result = await dbRun(executor.insert(invites).values(values));
  return { id: Number(result.lastInsertRowid), code: values.code };
}

export async function updateInviteStatus(id: number, status: string, updatedAt: Date) {
  await dbRun(db.update(invites).set({ status, updatedAt }).where(eq(invites.id, id)));
}

export async function deleteInviteById(id: number) {
  await dbRun(db.delete(invites).where(eq(invites.id, id)));
}

export async function expireOldInvites(now: Date) {
  await dbRun(
    db.update(invites).set({ status: "expired", updatedAt: now }).where(and(eq(invites.status, "unused"), lte(invites.expireAt, now)))
  );
}
