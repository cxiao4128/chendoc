/**
 * danger.repo.ts
 *
 * 危险操作模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑、审计日志。
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { db, dbGet, dbRun } from "../../db/client.js";
import { docs, shares } from "../../db/schema.js";
export { docs, shares };

import { now } from "../../utils/date.js";

export async function findDocByUid(docUid: string) {
  return dbGet(
    db.select({
      docUid: docs.docUid,
      title: docs.title,
      createdAt: docs.createdAt,
      updatedAt: docs.updatedAt,
      deletedAt: docs.deletedAt,
      shareCode: shares.shareCode,
      customSlug: shares.customSlug
    })
      .from(docs)
      .leftJoin(shares, eq(docs.id, shares.docId))
      .where(eq(docs.docUid, docUid))
      .limit(1)
  );
}

export async function softDeleteDocByUid(docUid: string, executor: any = db) {
  const t = now();
  await dbRun(executor.update(docs).set({ deletedAt: t, updatedAt: t }).where(and(eq(docs.docUid, docUid), isNull(docs.deletedAt))));
}

export async function hardDeleteDocByUid(docUid: string) {
  await dbRun(db.delete(docs).where(and(eq(docs.docUid, docUid), sql`${docs.deletedAt} IS NOT NULL`)));
}
