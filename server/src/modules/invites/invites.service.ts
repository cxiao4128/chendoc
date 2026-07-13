import { z } from "zod";
import { dbTransaction } from "../../db/client.js";
import { expireOldInvites, insertInvite, inviteCodeExists, listInvites as listInvitesFromRepo, updateInviteStatus, deleteInviteById } from "./invites.repo.js";
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

async function createUniqueCode(executor?: any) {
  for (let i = 0; i < 20; i += 1) {
    const code = generateInviteCode(8);
    const exists = await inviteCodeExists(code, executor);
    if (!exists) return code;
  }
  throw new Error("邀请码生成失败，请重试");
}

export async function refreshExpiredInvites() {
  await expireOldInvites(now());
}

export async function listInvites() {
  await refreshExpiredInvites();
  return listInvitesFromRepo();
}

export async function createInvite(adminId: number, input: z.infer<typeof inviteCreateSchema>) {
  const parsed = inviteCreateSchema.parse(input);
  const createdAt = now();
  const code = await createUniqueCode();
  const result = await insertInvite({
    code,
    status: "unused",
    createdBy: adminId,
    expireAt: parseExpireAt(parsed.expireAt),
    createdAt,
    updatedAt: createdAt
  });
  return { id: result.id, code: result.code };
}

export async function createInviteBatch(adminId: number, input: z.infer<typeof inviteBatchSchema>) {
  const parsed = inviteBatchSchema.parse(input);
  const created: Array<{ id: number; code: string }> = [];
  await dbTransaction(async (tx) => {
    for (let i = 0; i < parsed.count; i += 1) {
      const code = await createUniqueCode(tx);
      const createdAt = now();
      const result = await insertInvite({
        code,
        status: "unused",
        createdBy: adminId,
        expireAt: parseExpireAt(parsed.expireAt),
        createdAt,
        updatedAt: createdAt
      }, tx);
      created.push({ id: result.id, code: result.code });
    }
  });
  return created;
}

export async function disableInvite(id: number) {
  await updateInviteStatus(id, "disabled", now());
}

export async function deleteInvite(id: number) {
  await deleteInviteById(id);
}
