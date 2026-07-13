// Logs service - operation logs

import { listOperationLogs as listOperationLogsFromRepo } from "./logs.repo.js";

export async function listOperationLogs(limit = 80) {
  return listOperationLogsFromRepo(limit);
}
