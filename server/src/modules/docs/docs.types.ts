/**
 * docs.types.ts
 *
 * 文档模块的公开类型。
 * 只包含类型定义，不含任何运行时逻辑。
 */

import type { docs, shares, users } from "../../db/schema.js";

export type DocRecord = typeof docs.$inferSelect;
export type ShareRecord = typeof shares.$inferSelect;
export type UserRecord = typeof users.$inferSelect;
