import { ref } from "vue";
import type { ShareItem } from "../api/shares";

export function createDocShareState() {
  return {
    share: ref<ShareItem | null>(null),
    loading: ref(false),
    saving: ref(false),
    error: ref<string | null>(null),
    enabled: ref(false),
    password: ref(""),
    customSlug: ref(""),
    status: ref(""),
    hasPassword: ref(false),
    panelOpen: ref(false),
    debounceTimer: ref<number | null>(null),
    currentDocUid: ref<string | null>(null),
  };
}

export type DocShareState = ReturnType<typeof createDocShareState>;

export function syncDocShareForm(state: DocShareState, share: ShareItem | null) {
  if (!share) {
    state.enabled.value = false;
    state.password.value = "";
    state.customSlug.value = "";
    state.hasPassword.value = false;
    return;
  }

  state.enabled.value = !!share.isEnabled;
  state.customSlug.value = share.customSlug || "";
  state.hasPassword.value = !!share.hasPassword;
}

export function resetDocShareState(state: DocShareState) {
  state.share.value = null;
  state.loading.value = false;
  state.saving.value = false;
  state.error.value = null;
  state.enabled.value = false;
  state.password.value = "";
  state.customSlug.value = "";
  state.status.value = "";
  state.hasPassword.value = false;
  state.panelOpen.value = false;
  state.currentDocUid.value = null;
  if (state.debounceTimer.value) {
    window.clearTimeout(state.debounceTimer.value);
    state.debounceTimer.value = null;
  }
}
