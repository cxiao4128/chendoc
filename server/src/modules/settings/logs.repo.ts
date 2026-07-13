/**
 * logs.repo.ts
 *
 * 设置-日志模块的纯数据访问层。
 * 只做 DB 操作，不含业务逻辑。
 */

import { and, desc, eq, ne } from "drizzle-orm";
import { db, dbAll } from "../../db/client.js";
import { logs, users } from "../../db/schema.js";
export { logs, users };

export async function listOperationLogs(limit = 80) {
  return dbAll(
    db.select({
      id: logs.id,
      userId: logs.userId,
      username: users.username,
      action: logs.action,
      targetType: logs.targetType,
      targetId: logs.targetId,
      ip: logs.ip,
      userAgent: logs.userAgent,
      createdAt: logs.createdAt
    })
      .from(logs)
      .leftJoin(users, eq(logs.userId, users.id))
      .where(and(eq(logs.type, "operation_log"), ne(logs.action, "share.update")))
      .orderBy(desc(logs.createdAt), desc(logs.id))
      .limit(limit)
  );
}
