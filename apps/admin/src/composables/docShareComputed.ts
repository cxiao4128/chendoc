import { computed } from "vue";
import type { DocShareState } from "./docShareState";
import { publicUrl } from "../config/runtime";

export function formatDocShareDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function createDocShareComputed(state: DocShareState) {
  const shareUrl = computed(() => {
    if (!state.share.value?.isEnabled) return "";
    const key = state.share.value.customSlug || state.share.value.shareCode;
    return publicUrl(`/r/${key}`);
  });

  const canSharePublicly = computed(() => !!shareUrl.value && state.share.value?.isEnabled);

  const reviewStatusText = computed(() => {
    if (!state.share.value?.reviewStatus || state.share.value.reviewStatus === "approved") return "";
    if (state.share.value.reviewStatus === "pending") return "等待管理员审核，通过后才会公开。";
    if (state.share.value.reviewStatus === "rejected") {
      return state.share.value.reviewNote
        ? `审核未通过：${state.share.value.reviewNote}`
        : "审核未通过，可修改后重新提交。";
    }
    return "";
  });

  const accessText = computed(() => {
    if (!state.share.value?.isEnabled) return "当前无人可访问";
    return state.hasPassword.value ? "持有链接和密码的人" : "持有链接的人";
  });

  const expiryText = computed(() => {
    if (!state.share.value?.expireAt) return "长期有效";
    return formatDocShareDate(state.share.value.expireAt);
  });

  const message = computed(() => {
    if (state.loading.value || state.saving.value) return "自动更新中";
    if (state.error.value) return state.error.value;
    return state.status.value || "修改后自动更新，密码需点确认才生效";
  });

  const isStatusError = computed(() => {
    return state.status.value.includes("失败") || state.status.value.includes("占用") || state.status.value.includes("保留");
  });

  return {
    shareUrl,
    canSharePublicly,
    reviewStatusText,
    accessText,
    expiryText,
    message,
    isStatusError,
    formatDate: formatDocShareDate,
  };
}

export type DocShareComputed = ReturnType<typeof createDocShareComputed>;
