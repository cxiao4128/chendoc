import { ref } from "vue";
import type { DocVersion, DocVersionPreview } from "../api/docs";

export function useDocVersionState() {
  return {
    versions: ref<DocVersion[]>([]),
    selectedVersion: ref<DocVersion | null>(null),
    versionPreview: ref<DocVersionPreview | null>(null),
    versionPreviewLoading: ref(false)
  };
}
