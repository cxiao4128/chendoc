import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, dbAll, dbRun } from "../../db/client.js";
import { spaces } from "../../db/schema.js";
import { now } from "../../utils/date.js";

const spaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable()
});

export async function listSpaces() {
  return await dbAll<typeof spaces.$inferSelect>(db.select().from(spaces));
}

export async function createSpace(userId: number, input: unknown) {
  const body = spaceSchema.parse(input);
  const createdAt = now();
  const result = await dbRun(db.insert(spaces).values({
    name: body.name,
    description: body.description ?? null,
    ownerId: userId,
    createdAt,
    updatedAt: createdAt
  }));
  return { id: Number(result.lastInsertRowid) };
}

export async function updateSpace(id: number, input: unknown) {
  const body = spaceSchema.partial().parse(input);
  const patch: Partial<typeof spaces.$inferInsert> = { updatedAt: now() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  await dbRun(db.update(spaces).set(patch).where(eq(spaces.id, id)));
}

export async function deleteSpace(id: number) {
  await dbRun(db.delete(spaces).where(eq(spaces.id, id)));
}
