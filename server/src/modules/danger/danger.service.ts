import { dbTransaction } from "../../db/client.js";
import { findDocByUid as findDocByUidFromRepo, softDeleteDocByUid } from "./danger.repo.js";
import { enqueueLog } from "../../utils/asyncLogQueue.js";

export async function findDocByUid(docUid: string) {
  return findDocByUidFromRepo(docUid);
}

export async function dangerDeleteDoc(input: {
  docUid: string;
  userId: number;
  ip?: string;
  userAgent?: string;
}) {
  await dbTransaction(async (tx) => {
    await softDeleteDocByUid(input.docUid, tx);
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
