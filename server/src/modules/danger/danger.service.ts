import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { docs, operationLogs, shares } from "../../db/schema.js";
import { now } from "../../utils/date.js";

export function findDocById(id: number) {
  const doc = db
    .select({
      id: docs.id,
      title: docs.title,
      createdAt: docs.createdAt,
      updatedAt: docs.updatedAt,
      deletedAt: docs.deletedAt,
      shareCode: shares.shareCode
    })
    .from(docs)
    .leftJoin(shares, eq(docs.id, shares.docId))
    .where(eq(docs.id, id))
    .limit(1)
    .get();
  return doc ?? null;
}

export function dangerDeleteDoc(input: {
  id: number;
  userId: number;
  ip?: string;
  userAgent?: string;
}) {
  db.transaction((tx) => {
    tx.update(docs).set({ deletedAt: now(), updatedAt: now() }).where(and(eq(docs.id, input.id), isNull(docs.deletedAt))).run();
    tx.insert(operationLogs).values({
      userId: input.userId,
      action: "danger.doc.delete",
      targetType: "doc",
      targetId: String(input.id),
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt: now()
    }).run();
  });
}
