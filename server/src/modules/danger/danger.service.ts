import { and, eq, isNull } from "drizzle-orm";
import { db, dbGet, dbRun, dbTransaction } from "../../db/client.js";
import { docs, shares } from "../../db/schema.js";
import { now } from "../../utils/date.js";
import { enqueueLog } from "../../utils/asyncLogQueue.js";

export async function findDocByUid(docUid: string) {
  const doc = await dbGet(db
    .select({
      docUid: docs.docUid,
      title: docs.title,
      createdAt: docs.createdAt,
      updatedAt: docs.updatedAt,
      deletedAt: docs.deletedAt,
      shareCode: shares.shareCode
    })
    .from(docs)
    .leftJoin(shares, eq(docs.id, shares.docId))
    .where(eq(docs.docUid, docUid))
    .limit(1));
  return doc ?? null;
}

export async function dangerDeleteDoc(input: {
  docUid: string;
  userId: number;
  ip?: string;
  userAgent?: string;
}) {
  await dbTransaction(async (tx) => {
    await dbRun(tx.update(docs).set({ deletedAt: now(), updatedAt: now() }).where(and(eq(docs.docUid, input.docUid), isNull(docs.deletedAt))));
  });
  enqueueLog({
    type: "operation_log",
    userId: input.userId,
    action: "danger.doc.delete",
    targetType: "doc",
    targetId: input.docUid,
    ip: input.ip,
    userAgent: input.userAgent,
    statusCode: 200,
    message: "success"
  });
}
