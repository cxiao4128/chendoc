import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { spaces, insertSpace, updateSpaceById, deleteSpaceById, listSpaces as listSpacesFromRepo } from "./spaces.repo.js";
import { now } from "../../utils/date.js";

const spaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable()
});

type Actor = { id: number; role: "admin" | "user"; isSuperAdmin?: boolean };

function accessWhere(actor: Actor, id?: number) {
  const base = actor.isSuperAdmin ? undefined : eq(spaces.ownerId, actor.id);
  if (!id) return base;
  return base ? and(eq(spaces.id, id), base) : eq(spaces.id, id);
}

export async function listSpaces(actor: Actor) {
  const where = accessWhere(actor);
  return listSpacesFromRepo(where);
}

export async function createSpace(userId: number, input: unknown) {
  const body = spaceSchema.parse(input);
  const createdAt = now();
  const result = await insertSpace({
    name: body.name,
    description: body.description ?? null,
    ownerId: userId,
    createdAt,
    updatedAt: createdAt
  });
  return { id: result.id };
}

export async function updateSpace(id: number, input: unknown, actor: Actor) {
  const body = spaceSchema.partial().parse(input);
  const patch: Record<string, unknown> = { updatedAt: now() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  const where = accessWhere(actor, id);
  if (!where) throw new Error("空间不存在");
  const result = await updateSpaceById(id, patch, actor.isSuperAdmin ? undefined : actor.id);
  if (result.changes < 1) throw new Error("空间不存在");
}

export async function deleteSpace(id: number, actor: Actor) {
  const where = accessWhere(actor, id);
  if (!where) throw new Error("空间不存在");
  const result = await deleteSpaceById(id, actor.isSuperAdmin ? undefined : actor.id);
  if (result.changes < 1) throw new Error("空间不存在");
}
