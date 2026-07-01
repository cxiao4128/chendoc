import { ref } from "vue";
import type { ShareItem } from "../api/shares";

export function useDocShareState() {
  return {
    share: ref<ShareItem | null>(null),
    shareLoading: ref(false),
    shareEnabled: ref(false),
    sharePassword: ref(""),
    shareCodeInput: ref(""),
    customSlugInput: ref(""),
    shareStatus: ref(""),
    shareHasPassword: ref(false),
    sharePanelOpen: ref(false)
  };
}
