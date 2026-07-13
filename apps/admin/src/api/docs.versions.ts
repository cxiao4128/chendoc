import { request } from "./request";
import type { DocDetail, DocSchedule, DocVersion, DocVersionPreview, SetScheduleInput } from "./docs.types";

export function getDocScheduleApi(docUid: string) {
  return request<{ schedule: DocSchedule | null }>(`/api/docs/${docUid}/schedule`);
}

export function setDocScheduleApi(docUid: string, input: SetScheduleInput) {
  return request<{ schedule: DocSchedule }>(`/api/docs/${docUid}/schedule`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteDocScheduleApi(docUid: string) {
  return request<{ ok: true }>(`/api/docs/${docUid}/schedule`, { method: "DELETE" });
}

export function listDocVersionsApi(docUid: string) {
  return request<{ versions: DocVersion[] }>(`/api/docs/${docUid}/versions`);
}

export function restoreDocVersionApi(docUid: string, versionId: number) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}/versions/${versionId}/restore`, { method: "POST" });
}

export function getDocVersionPreviewApi(docUid: string, versionId: number) {
  return request<{ version: DocVersionPreview }>(`/api/docs/${docUid}/versions/${versionId}`);
}

export function restoreDocVersionAsCopyApi(docUid: string, versionId: number) {
  return request<{ doc: DocDetail }>(`/api/docs/${docUid}/versions/${versionId}/restore-copy`, { method: "POST" });
}
