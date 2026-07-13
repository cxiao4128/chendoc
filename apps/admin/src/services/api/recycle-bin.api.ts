import {
  bulkHardDeleteTrashDocsApi,
  bulkRestoreTrashDocsApi,
  getTrashStatsApi,
  hardDeleteDocApi,
  listTrashDocsApi,
  restoreDocApi
} from "../../api/docs";

export type { DocSummary, TrashStats } from "../../api/docs";

export const recycleBinApi = {
  list: listTrashDocsApi,
  stats: getTrashStatsApi,
  restoreOne: restoreDocApi,
  restoreMany: bulkRestoreTrashDocsApi,
  deleteOne: hardDeleteDocApi,
  deleteMany: bulkHardDeleteTrashDocsApi
};
