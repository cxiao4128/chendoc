import { createDocShareActions } from "./docShareActions";
import { createDocShareComputed } from "./docShareComputed";
import { createDocShareState } from "./docShareState";
import type { NormalizedDocShareOptions, UseDocShareOptions } from "./docShareTypes";

export type { UseDocShareOptions } from "./docShareTypes";

export function useDocShare(options: UseDocShareOptions = {}) {
  const {
    autoLoad = true,
    debounceDelay = 700,
    onLoaded,
    onSaved,
    onError,
  } = options;
  const normalizedOptions: NormalizedDocShareOptions = {
    autoLoad,
    debounceDelay,
    onLoaded,
    onSaved,
    onError,
  };
  const state = createDocShareState();
  const computedState = createDocShareComputed(state);
  const actions = createDocShareActions(state, computedState, normalizedOptions);

  return {
    share: state.share,
    loading: state.loading,
    saving: state.saving,
    error: state.error,
    enabled: state.enabled,
    password: state.password,
    customSlug: state.customSlug,
    status: state.status,
    hasPassword: state.hasPassword,
    panelOpen: state.panelOpen,
    ...computedState,
    ...actions,
  };
}

// 保持向后兼容的导出
export function useDocShareState() {
  const {
    share,
    loading,
    enabled,
    password,
    customSlug,
    status,
    hasPassword,
    panelOpen,
  } = useDocShare();

  return {
    share,
    shareLoading: loading,
    shareEnabled: enabled,
    sharePassword: password,
    shareCodeInput: customSlug, // 注意：这里是 customSlug
    customSlugInput: customSlug,
    shareStatus: status,
    shareHasPassword: hasPassword,
    sharePanelOpen: panelOpen,
  };
}
