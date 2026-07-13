import { watch } from "vue";
import type { SharePatch } from "../services/api/share.api";
import { createShareApi, getShareByDocApi, updateShareApi } from "../services/api/share.api";
import type { DocShareComputed } from "./docShareComputed";
import type { DocShareState } from "./docShareState";
import { resetDocShareState, syncDocShareForm } from "./docShareState";
import type { NormalizedDocShareOptions } from "./docShareTypes";

export function createDocShareActions(
  state: DocShareState,
  computedState: DocShareComputed,
  options: NormalizedDocShareOptions,
) {
  const { autoLoad, debounceDelay, onLoaded, onSaved, onError } = options;

  async function load(docUid: string) {
    state.currentDocUid.value = docUid;
    state.loading.value = true;
    state.error.value = null;
    state.status.value = "";

    try {
      const response = await getShareByDocApi(docUid);
      state.share.value = response.share;
      syncDocShareForm(state, response.share);
      onLoaded?.(response.share);
      return response.share;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      state.error.value = e.message;
      state.status.value = "分享信息加载失败，可稍后重试。";
      onError?.(e);
      return null;
    } finally {
      state.loading.value = false;
    }
  }

  async function ensureShare(docUid: string) {
    if (state.share.value) return state.share.value;

    try {
      const created = await createShareApi(docUid);
      state.share.value = created.share;
      return created.share;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      state.error.value = e.message;
      onError?.(e);
      return null;
    }
  }

  async function save(saveOptions: {
    passwordConfirmed?: boolean;
    clearPassword?: boolean;
    customSlugConfirmed?: boolean;
  } = {}) {
    if (!state.currentDocUid.value) return;

    const docUid = state.currentDocUid.value;
    state.saving.value = true;
    state.error.value = null;

    try {
      const target = state.enabled.value ? await ensureShare(docUid) : state.share.value;
      if (!target) return;

      const patch: SharePatch = {
        isEnabled: state.enabled.value,
        expireAt: null,
      };

      if (saveOptions.passwordConfirmed && state.password.value.trim()) {
        patch.password = state.password.value.trim();
      }

      if (saveOptions.clearPassword) {
        patch.password = null;
      }

      if (saveOptions.customSlugConfirmed) {
        const nextCustomSlug = state.customSlug.value.trim();
        patch.customSlug = nextCustomSlug || null;
      }

      await updateShareApi(target.id, patch);

      const response = await getShareByDocApi(docUid);
      state.share.value = response.share;
      syncDocShareForm(state, response.share);
      state.password.value = "";

      if (response.share?.reviewStatus === "pending") {
        state.status.value = "已提交管理员审核，通过后才会公开。";
      } else if (saveOptions.passwordConfirmed) {
        state.status.value = "密码已确认并更新";
      } else {
        state.status.value = "已自动更新，无访问密码";
      }

      onSaved?.(response.share ?? state.share.value!);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      state.error.value = e.message;
      state.status.value = e.message;
      onError?.(e);
    } finally {
      state.saving.value = false;
    }
  }

  function scheduleSave() {
    if (state.debounceTimer.value) {
      window.clearTimeout(state.debounceTimer.value);
    }
    state.status.value = "等待自动更新";
    state.debounceTimer.value = window.setTimeout(() => {
      state.debounceTimer.value = null;
      void save();
    }, debounceDelay);
  }

  async function confirmPassword() {
    if (!state.password.value.trim()) {
      state.status.value = "密码为空，当前按无密码分享";
      await save({ clearPassword: true });
      return;
    }
    await save({ passwordConfirmed: true });
  }

  async function clearPassword() {
    state.password.value = "";
    await save({ clearPassword: true });
  }

  async function saveCustomSlug() {
    await save({ customSlugConfirmed: true });
  }

  async function copyLink() {
    if (!state.share.value?.isEnabled) {
      state.status.value = "先开启公开分享，再复制链接。";
      state.panelOpen.value = true;
      return false;
    }

    if (!computedState.shareUrl.value) {
      state.status.value = computedState.reviewStatusText.value || "分享还未公开，暂时没有可复制链接。";
      return false;
    }

    try {
      await navigator.clipboard.writeText(computedState.shareUrl.value);
      state.status.value = `已复制 ${computedState.shareUrl.value} · ${computedState.accessText.value} · ${computedState.expiryText.value}`;
      return true;
    } catch {
      state.status.value = "复制失败，请手动复制链接。";
      return false;
    }
  }

  async function resubmitForReview() {
    state.enabled.value = true;
    await save();
  }

  function openPanel() {
    state.panelOpen.value = true;
  }

  function closePanel() {
    state.panelOpen.value = false;
  }

  function togglePanel() {
    state.panelOpen.value = !state.panelOpen.value;
  }

  if (autoLoad) {
    watch(state.enabled, () => {
      if (state.currentDocUid.value) {
        scheduleSave();
      }
    });

  }

  return {
    load,
    save,
    scheduleSave,
    ensureShare,
    confirmPassword,
    clearPassword,
    saveCustomSlug,
    copyLink,
    resubmitForReview,
    openPanel,
    closePanel,
    togglePanel,
    reset: () => resetDocShareState(state),
  };
}
