/**
 * auth.repo.ts
 *
 * 认证模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑、密码处理、session 管理。
 */

import { and, eq } from "drizzle-orm";
import { db, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { invites, users } from "../../db/schema.js";
export { invites, users };

export async function getUserByUsername(username: string) {
  return dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.username, username)).limit(1));
}

export async function getUserById(userId: number) {
  return dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.id, userId)).limit(1));
}

export async function insertUser(values: {
  username: string;
  passwordHash: string;
  role: "user" | "admin";
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
}) {
  const result = await dbRun(db.insert(users).values(values));
  return { id: Number(result.lastInsertRowid) };
}

export async function updateUserPassword(userId: number, passwordHash: string, updatedAt: Date) {
  await dbRun(db.update(users).set({ passwordHash, updatedAt }).where(eq(users.id, userId)));
}

export async function usernameExists(username: string) {
  const r = await dbGet<{ id: number }>(db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1));
  return !!r;
}

export async function getInviteByCodeAndStatus(code: string, status: string) {
  return dbGet<typeof invites.$inferSelect>(
    db.select().from(invites).where(and(eq(invites.code, code), eq(invites.status, status as "unused"))).limit(1)
  );
}

export async function markInviteUsed(inviteId: number, userId: number, usedAt: Date, updatedAt: Date) {
  return dbRun(
    db.update(invites).set({ status: "used", usedBy: userId, usedAt, updatedAt })
      .where(and(eq(invites.id, inviteId), eq(invites.status, "unused")))
  );
}

export async function createUserAndConsumeInvite(
  username: string,
  passwordHash: string,
  inviteCode: string,
  now: Date
): Promise<{ userId: number }> {
  return dbTransaction(async (tx) => {
    const invite = await dbGet<typeof invites.$inferSelect>(
      tx.select().from(invites)
        .where(and(eq(invites.code, inviteCode.toUpperCase()), eq(invites.status, "unused")))
        .limit(1)
    );

    if (!invite || invite.usedAt || (invite.expireAt && invite.expireAt.getTime() <= now.getTime())) {
      throw new Error("INVITE_INVALID");
    }

    const existing = await dbGet<{ id: number }>(
      tx.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)
    );
    if (existing) {
      throw new Error("USERNAME_UNAVAILABLE");
    }

    const insert = await dbRun(tx.insert(users).values({
      username,
      passwordHash,
      role: "user",
      status: "active",
      createdAt: now,
      updatedAt: now
    }));

    const userId = Number(insert.lastInsertRowid);
    const inviteUpdate = await dbRun(
      tx.update(invites).set({ status: "used", usedBy: userId, usedAt: now, updatedAt: now })
        .where(and(eq(invites.id, invite.id), eq(invites.status, "unused")))
    );
    if (inviteUpdate.changes !== 1) {
      throw new Error("INVITE_USED");
    }

    return { userId };
  });
}
