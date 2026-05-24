import { and, desc, eq, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { db, dbAll, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { invites, users } from "../../db/schema.js";
import { generateInviteCode } from "../../utils/inviteCode.js";
import { now } from "../../utils/date.js";

export const inviteCreateSchema = z.object({
  expireAt: z.string().datetime().optional().nullable()
});

export const inviteBatchSchema = inviteCreateSchema.extend({
  count: z.number().int().min(1).max(100).default(10)
});

function parseExpireAt(expireAt?: string | null) {
  return expireAt ? new Date(expireAt) : null;
}

async function createUniqueCode(queryDb: typeof db = db) {
  for (let i = 0; i < 20; i += 1) {
    const code = generateInviteCode(8);
    const exists = await dbGet<{ id: number }>(queryDb.select({ id: invites.id }).from(invites).where(eq(invites.code, code)).limit(1));
    if (!exists) return code;
  }
  throw new Error("邀请码生成失败，请重试");
}

export async function refreshExpiredInvites() {
  await dbRun(db.update(invites)
    .set({ status: "expired", updatedAt: now() })
    .where(and(eq(invites.status, "unused"), lte(invites.expireAt, now()))));
}

export async function listInvites() {
  await refreshExpiredInvites();
  return await dbAll(db
    .select({
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
    .orderBy(desc(invites.createdAt)));
}

export async function createInvite(adminId: number, input: z.infer<typeof inviteCreateSchema>) {
  const parsed = inviteCreateSchema.parse(input);
  const createdAt = now();
  const code = await createUniqueCode();
  const result = await dbRun(db.insert(invites).values({
    code,
    status: "unused",
    createdBy: adminId,
    expireAt: parseExpireAt(parsed.expireAt),
    createdAt,
    updatedAt: createdAt
  }));
  return { id: Number(result.lastInsertRowid), code };
}

export async function createInviteBatch(adminId: number, input: z.infer<typeof inviteBatchSchema>) {
  const parsed = inviteBatchSchema.parse(input);
  const created: Array<{ id: number; code: string }> = [];
  await dbTransaction(async (tx) => {
    for (let i = 0; i < parsed.count; i += 1) {
      const code = await createUniqueCode(tx);
      const createdAt = now();
      const result = await dbRun(tx.insert(invites).values({
        code,
        status: "unused",
        createdBy: adminId,
        expireAt: parseExpireAt(parsed.expireAt),
        createdAt,
        updatedAt: createdAt
      }));
      created.push({ id: Number(result.lastInsertRowid), code });
    }
  });
  return created;
}

export async function disableInvite(id: number) {
  await dbRun(db.update(invites)
    .set({ status: "disabled", updatedAt: now() })
    .where(and(eq(invites.id, id), ne(invites.status, "used"))));
}

export async function deleteInvite(id: number) {
  await dbRun(db.delete(invites).where(eq(invites.id, id)));
}
