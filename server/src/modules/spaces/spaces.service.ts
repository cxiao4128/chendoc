import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { spaces } from "../../db/schema.js";
import { now } from "../../utils/date.js";

const spaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable()
});

export function listSpaces() {
  return db.select().from(spaces).all();
}

export function createSpace(userId: number, input: unknown) {
  const body = spaceSchema.parse(input);
  const createdAt = now();
  const result = db.insert(spaces).values({
    name: body.name,
    description: body.description ?? null,
    ownerId: userId,
    createdAt,
    updatedAt: createdAt
  }).run();
  return { id: Number(result.lastInsertRowid) };
}

export function updateSpace(id: number, input: unknown) {
  const body = spaceSchema.partial().parse(input);
  const patch: Partial<typeof spaces.$inferInsert> = { updatedAt: now() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  db.update(spaces).set(patch).where(eq(spaces.id, id)).run();
}

export function deleteSpace(id: number) {
  db.delete(spaces).where(eq(spaces.id, id)).run();
}
