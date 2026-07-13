/**
 * features/recycle-bin/public-api.ts
 *
 * 回收站域统一导出入口
 */

export { recycleBinService } from "./services/recycle-bin.service";

export type { RecycleBinDocument, TrashStats } from "./types";
