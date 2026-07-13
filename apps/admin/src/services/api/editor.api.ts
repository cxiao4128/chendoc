import {
  deleteDocScheduleApi,
  getDocApi,
  getDocScheduleApi,
  getDocVersionPreviewApi,
  listDocVersionsApi,
  publishDocApi,
  restoreDocVersionApi,
  restoreDocVersionAsCopyApi,
  setDocScheduleApi,
  updateDocApi
} from "../../api/docs";

export type {
  DocDetail,
  DocSchedule,
  DocUpdateInput,
  DocVersion,
  DocVersionPreview,
  SetScheduleInput
} from "../../api/docs";

export const editorApi = {
  detail: getDocApi,
  save: updateDocApi,
  publish: publishDocApi,
  listVersions: listDocVersionsApi,
  previewVersion: getDocVersionPreviewApi,
  restoreVersion: restoreDocVersionApi,
  restoreVersionAsCopy: restoreDocVersionAsCopyApi,
  getSchedule: getDocScheduleApi,
  setSchedule: setDocScheduleApi,
  deleteSchedule: deleteDocScheduleApi
};
