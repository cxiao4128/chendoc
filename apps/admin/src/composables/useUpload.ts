import { uploadFile } from "../features/upload/services/upload.service";

export function useUpload() {
  return { uploadFile };
}
