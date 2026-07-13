/**
 * templates.repo.ts
 *
 * 模板模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑、权限检查。
 */

import { and, desc, eq } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { templates } from "../../db/schema.js";
export { templates };

export async function listTemplates(ownerId: number) {
  return dbAll(
    db.select().from(templates)
      .where(eq(templates.ownerId, ownerId))
      .orderBy(desc(templates.sort), templates.title)
  );
}

export async function listBuiltInTemplates() {
  return dbAll(
    db.select().from(templates)
      .where(eq(templates.isBuiltIn, true))
      .orderBy(desc(templates.sort), templates.title)
  );
}

export async function getTemplateById(id: number, ownerId?: number) {
  const where = ownerId
    ? and(eq(templates.id, id), eq(templates.ownerId, ownerId))
    : eq(templates.id, id);
  return dbGet<typeof templates.$inferSelect>(db.select().from(templates).where(where).limit(1));
}

export async function insertTemplate(values: {
  templateUid: string;
  title: string;
  summary: string | null;
  html: string;
  contentJson: string | null;
  sort: number;
  isBuiltIn: boolean;
  ownerId: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  await dbRun(db.insert(templates).values(values));
  const created = await dbGet<typeof templates.$inferSelect>(
    db.select().from(templates).where(eq(templates.templateUid, values.templateUid)).limit(1)
  );
  return created;
}

export async function updateTemplateById(
  id: number,
  ownerId: number,
  patch: Partial<typeof templates.$inferInsert>
) {
  const result = await dbRun(
    db.update(templates).set(patch).where(and(eq(templates.id, id), eq(templates.ownerId, ownerId)))
  );
  if (result.changes < 1) return null;
  return dbGet<typeof templates.$inferSelect>(db.select().from(templates).where(eq(templates.id, id)).limit(1));
}

export async function deleteTemplateById(id: number, ownerId: number) {
  const result = await dbRun(
    db.delete(templates).where(and(eq(templates.id, id), eq(templates.ownerId, ownerId)))
  );
  return result.changes > 0;
}

export async function getTemplateCountByOwner(ownerId: number) {
  return dbAll(db.select({ id: templates.id }).from(templates).where(eq(templates.ownerId, ownerId)));
}
