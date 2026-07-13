import { and, desc, eq, sql } from "drizzle-orm";
import { db, dbAll, dbGet, dbRun } from "../../db/client.js";
import { docCommentReactions, docComments, docs, users } from "../../db/schema.js";
export { docComments, docCommentReactions, docs, users };

export async function listCommentsByDocUid(docUid: string) {
  return dbAll(
    db.select({
      id: docComments.id,
      docUid: docComments.docUid,
      parentId: docComments.parentId,
      userId: docComments.userId,
      username: users.username,
      content: docComments.content,
      selectionStart: docComments.selectionStart,
      selectionEnd: docComments.selectionEnd,
      selectionText: docComments.selectionText,
      status: docComments.status,
      createdAt: docComments.createdAt,
      updatedAt: docComments.updatedAt,
    })
      .from(docComments)
      .leftJoin(users, eq(docComments.userId, users.id))
      .where(eq(docComments.docUid, docUid))
      .orderBy(desc(docComments.createdAt))
  );
}

export async function getCommentById(id: number) {
  return dbGet<typeof docComments.$inferSelect>(db.select().from(docComments).where(eq(docComments.id, id)).limit(1));
}

export async function getCommentReactions(commentId: number) {
  return dbAll(
    db.select({
      reaction: docCommentReactions.reaction,
      count: sql<number>`count(*)`.as("count"),
    })
      .from(docCommentReactions)
      .where(eq(docCommentReactions.commentId, commentId))
      .groupBy(docCommentReactions.reaction)
  );
}

export async function getUserReaction(commentId: number, userId: number) {
  return dbGet<typeof docCommentReactions.$inferSelect>(
    db.select().from(docCommentReactions).where(and(
      eq(docCommentReactions.commentId, commentId),
      eq(docCommentReactions.userId, userId)
    )).limit(1)
  );
}

export async function getReplyCount(commentId: number) {
  const result = await dbAll(
    db.select({ count: sql<number>`count(*)` })
      .from(docComments)
      .where(and(eq(docComments.parentId, commentId), eq(docComments.status, "active")))
  );
  return Number(result[0]?.count || 0);
}

export async function insertComment(values: {
  docUid: string;
  parentId?: number | null;
  userId: number;
  content: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  selectionText?: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  const result = await dbRun(db.insert(docComments).values(values));
  const row = await dbGet<typeof docComments.$inferSelect>(
    db.select().from(docComments).where(eq(docComments.id, Number(result.lastInsertRowid))).limit(1)
  );
  if (!row) throw new Error("Comment creation failed.");
  return row;
}

export async function updateCommentById(id: number, patch: {
  content?: string;
  status?: string;
  updatedAt: Date;
}) {
  const result = await dbRun(db.update(docComments).set(patch).where(eq(docComments.id, id)));
  if (result.changes !== 1) throw new Error("Comment update failed.");
  const row = await dbGet<typeof docComments.$inferSelect>(
    db.select().from(docComments).where(eq(docComments.id, id)).limit(1)
  );
  if (!row) throw new Error("Comment update failed.");
  return row;
}

export async function softDeleteCommentById(id: number, updatedAt: Date) {
  return dbAll(
    db.update(docComments).set({ status: "deleted", updatedAt }).where(eq(docComments.id, id))
  );
}

export async function softDeleteRepliesByParentId(parentId: number, updatedAt: Date) {
  return dbAll(
    db.update(docComments).set({ status: "deleted", updatedAt }).where(eq(docComments.parentId, parentId))
  );
}

export async function deleteReactionsByCommentId(commentId: number) {
  return dbAll(db.delete(docCommentReactions).where(eq(docCommentReactions.commentId, commentId)));
}

export async function upsertReaction(commentId: number, userId: number, reaction: string, createdAt: Date) {
  const existing = await getUserReaction(commentId, userId);
  if (existing) {
    if (existing.reaction === reaction) {
      await dbAll(db.delete(docCommentReactions).where(eq(docCommentReactions.id, existing.id)));
    } else {
      await dbAll(db.update(docCommentReactions).set({ reaction, createdAt }).where(eq(docCommentReactions.id, existing.id)));
    }
  } else {
    await dbAll(db.insert(docCommentReactions).values({ commentId, userId, reaction, createdAt }));
  }
}

export async function insertReaction(values: { commentId: number; userId: number; reaction: string; createdAt: Date }) {
  return dbAll(db.insert(docCommentReactions).values(values));
}

export async function deleteReactionById(id: number) {
  return dbAll(db.delete(docCommentReactions).where(eq(docCommentReactions.id, id)));
}

export async function updateReactionById(id: number, reaction: string, createdAt: Date) {
  return dbAll(db.update(docCommentReactions).set({ reaction, createdAt }).where(eq(docCommentReactions.id, id)));
}

export async function listAllComments(opts: {
  docUid?: string;
  status?: string;
  userId?: number;
  keyword?: string;
  pageSize: number;
  offset: number;
}) {
  const conditions: any[] = [];
  if (opts.docUid) conditions.push(eq(docComments.docUid, opts.docUid));
  if (opts.status) {
    conditions.push(eq(docComments.status, opts.status as "active" | "hidden" | "deleted"));
  } else {
    conditions.push(sql`${docComments.status} != 'deleted'`);
  }
  if (opts.userId) conditions.push(eq(docComments.userId, opts.userId));
  if (opts.keyword) conditions.push(sql`${docComments.content} LIKE ${`%${opts.keyword}%`}`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await dbAll(
    db.select({
      id: docComments.id,
      docUid: docComments.docUid,
      parentId: docComments.parentId,
      userId: docComments.userId,
      username: users.username,
      content: docComments.content,
      selectionStart: docComments.selectionStart,
      selectionEnd: docComments.selectionEnd,
      selectionText: docComments.selectionText,
      status: docComments.status,
      createdAt: docComments.createdAt,
      updatedAt: docComments.updatedAt,
    })
      .from(docComments)
      .leftJoin(users, eq(docComments.userId, users.id))
      .where(whereClause)
      .orderBy(desc(docComments.createdAt))
      .limit(opts.pageSize)
      .offset(opts.offset)
  );
  return rows;
}

export async function countComments(opts: {
  docUid?: string;
  status?: string;
  userId?: number;
  keyword?: string;
}) {
  const conditions: any[] = [];
  if (opts.docUid) conditions.push(eq(docComments.docUid, opts.docUid));
  if (opts.status) {
    conditions.push(eq(docComments.status, opts.status as "active" | "hidden" | "deleted"));
  } else {
    conditions.push(sql`${docComments.status} != 'deleted'`);
  }
  if (opts.userId) conditions.push(eq(docComments.userId, opts.userId));
  if (opts.keyword) conditions.push(sql`${docComments.content} LIKE ${`%${opts.keyword}%`}`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const result = await dbAll(
    db.select({ count: sql<number>`count(*)` }).from(docComments).where(whereClause)
  );
  return Number(result[0]?.count || 0);
}

export async function batchSoftDeleteComments(ids: number[], updatedAt: Date) {
  if (ids.length === 0) return;
  return dbAll(
    db.update(docComments)
      .set({ status: "deleted", updatedAt })
      .where(sql`${docComments.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)
  );
}

export async function batchDeleteReactions(ids: number[]) {
  if (ids.length === 0) return;
  return dbAll(
    db.delete(docCommentReactions)
      .where(sql`${docCommentReactions.commentId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)
  );
}

export async function getDocOwnerId(docUid: string) {
  return dbGet<{ ownerId: number }>(db.select({ ownerId: docs.ownerId }).from(docs).where(eq(docs.docUid, docUid)).limit(1));
}

export async function getUsernameById(userId: number) {
  return dbGet<{ username: string }>(db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1));
}
