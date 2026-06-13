import { request } from "./request";

export interface PresignInput {
  fileName: string;
  mimeType: string;
  size: number;
  kind: "image" | "video" | "file";
  docUid?: string | null;
}

export interface UploadPolicyItem {
  extensions: string[];
  mime: string[];
  mimeByExtension: Record<string, string[]>;
  maxMb: number;
  maxBytes: number;
}

export type UploadPolicy = Record<PresignInput["kind"], UploadPolicyItem>;

export function getUploadPolicyApi() {
  return request<{ policy: UploadPolicy }>("/api/uploads/policy");
}

export function presignUploadApi(input: PresignInput) {
  return request<{ uploadUrl: string; uploadToken: string; objectKey: string; publicUrl: string }>("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function completeUploadApi(input: PresignInput & { uploadToken: string; objectKey?: string; publicUrl?: string }) {
  return request<{ upload: { id: number; publicUrl: string } }>("/api/uploads/complete", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
