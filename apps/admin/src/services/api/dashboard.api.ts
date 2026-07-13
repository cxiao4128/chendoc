import { getSystemStatusApi, listOperationLogsApi } from "../../api/settings";

export const dashboardApi = {
  status: getSystemStatusApi,
  logs: listOperationLogsApi
};
