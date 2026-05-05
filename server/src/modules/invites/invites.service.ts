import { and, desc, eq, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
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

function createUniqueCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = generateInviteCode(8);
    const exists = db.select({ id: invites.id }).from(invites).where(eq(invites.code, code)).limit(1).get();
    if (!exists) return code;
  }
  throw new Error("邀请码生成失败，请重试");
}

export function refreshExpiredInvites() {
  db.update(invites)
    .set({ status: "expired", updatedAt: now() })
    .where(and(eq(invites.status, "unused"), lte(invites.expireAt, now())))
    .run();
}

export function listInvites() {
  refreshExpiredInvites();
  return db
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
    .orderBy(desc(invites.createdAt))
    .all();
}

export function createInvite(adminId: number, input: z.infer<typeof inviteCreateSchema>) {
  const parsed = inviteCreateSchema.parse(input);
  const createdAt = now();
  const code = createUniqueCode();
  const result = db.insert(invites).values({
    code,
    status: "unused",
    createdBy: adminId,
    expireAt: parseExpireAt(parsed.expireAt),
    createdAt,
    updatedAt: createdAt
  }).run();
  return { id: Number(result.lastInsertRowid), code };
}

export function createInviteBatch(adminId: number, input: z.infer<typeof inviteBatchSchema>) {
  const parsed = inviteBatchSchema.parse(input);
  const created: Array<{ id: number; code: string }> = [];
  db.transaction((tx) => {
    for (let i = 0; i < parsed.count; i += 1) {
      const code = createUniqueCode();
      const createdAt = now();
      const result = tx.insert(invites).values({
        code,
        status: "unused",
        createdBy: adminId,
        expireAt: parseExpireAt(parsed.expireAt),
        createdAt,
        updatedAt: createdAt
      }).run();
      created.push({ id: Number(result.lastInsertRowid), code });
    }
  });
  return created;
}

export function disableInvite(id: number) {
  db.update(invites)
    .set({ status: "disabled", updatedAt: now() })
    .where(and(eq(invites.id, id), ne(invites.status, "used")))
    .run();
}

export function deleteInvite(id: number) {
  db.delete(invites).where(eq(invites.id, id)).run();
}
