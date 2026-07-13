import {
  createFormApi,
  deleteAllSubmissionsApi,
  deleteFormApi,
  deleteSubmissionApi,
  exportFormApi,
  getFormApi,
  getIpStatsApi,
  listFormsApi,
  listSubmissionsApi,
  publishFormApi,
  updateFormApi
} from "../../api/forms";

export type {
  FieldType,
  FormConfig,
  FormField,
  FormItem,
  IpStats,
  SubmissionItem
} from "../../api/forms";

export const formsApi = {
  list: listFormsApi,
  create: createFormApi,
  detail: getFormApi,
  update: updateFormApi,
  delete: deleteFormApi,
  publish: publishFormApi,
  submissions: listSubmissionsApi,
  export: exportFormApi,
  ipStats: getIpStatsApi,
  deleteSubmission: deleteSubmissionApi,
  deleteAllSubmissions: deleteAllSubmissionsApi
};
