/**
 * features/editor/hooks/useEditorShare.ts - 编辑器分享操作 Hook
 *
 * 重构说明：
 * - 从 pages/docs/composables/useDocEditorShareActions.ts 迁移
 * - 封装分享 URL、状态文本、操作方法
 */
import { computed, watch, type Ref } from "vue";
import { createShareApi, getShareByDocApi, updateShareApi, type SharePatch } from "@/services/api";
import { useDocEditorContext } from "../../../composables/useDocEditorContext";
import { absoluteShareUrlOf } from "../../../utils/sharePath";

export interface UseEditorShareOptions {
  /** 分享面板是否打开 */
  panelOpen: Ref<boolean>;
  /** 复制状态 */
  copied: Ref<boolean>;
}

export interface EditorShareSaveOptions {
  passwordConfirmed?: boolean;
  clearPassword?: boolean;
  customSlugConfirmed?: boolean;
}

export interface EditorSharePatchInput extends EditorShareSaveOptions {
  enabled: boolean;
  password: string;
  customSlug: string;
  isAdmin: boolean;
}

/** Only fields backed by an explicit user action may cross the save boundary. */
export function createEditorSharePatch(input: EditorSharePatchInput): SharePatch {
  const patch: SharePatch = { isEnabled: input.enabled };
  if (input.passwordConfirmed && input.password.trim()) {
    patch.password = input.password.trim();
  }
  if (input.clearPassword) patch.password = null;
  if (input.isAdmin && input.customSlugConfirmed) {
    patch.customSlug = input.customSlug.trim() || null;
  }
  return patch;
}

// ============= 导出 Hook =============
export function useEditorShare(options: UseEditorShareOptions) {
  const ctx = useDocEditorContext();
  const { panelOpen, copied } = options;

  // 解构上下文属性
  const {
    current,
    share,
    shareLoading,
    shareEnabled,
    sharePassword,
    shareCodeInput,
    customSlugInput,
    shareStatus,
    shareHasPassword
  } = ctx;
  let saveQueue: Promise<void> = Promise.resolve();
  let saveSequence = 0;

  // ============= 计算属性 =============

  /** 分享链接 */
  const shareUrl = computed(() => share.value?.isEnabled ? absoluteShareUrlOf(share.value) : "");

  /** 审核状态文本 */
  const shareReviewText = computed(() => {
    if (!share.value?.reviewStatus || share.value.reviewStatus === "approved") return "";
    if (share.value.reviewStatus === "pending") return "等待管理员审核，通过后才会公开。";
    return share.value.reviewNote ? `审核未通过：${share.value.reviewNote}` : "审核未通过，可修改后重新提交。";
  });

  /** 分享状态文本 */
  const shareStateText = computed(() => {
    if (!share.value) return current.value?.status === "published" ? "已发布 · 未公开" : "草稿";
    if (share.value.reviewStatus === "pending") return "已发布 → 待审核";
    if (share.value.reviewStatus === "rejected") return "已发布 → 已拒绝";
    if (share.value.isEnabled) return "已发布 → 已公开";
    return "已发布 → 已关闭";
  });

  /** 访问权限文本 */
  const shareAccessText = computed(() => share.value?.isEnabled ? (shareHasPassword.value ? "持有链接和密码的人" : "持有链接的人") : "当前无人可访问");

  /** 过期时间文本 */
  const shareExpiryText = computed(() => share.value?.expireAt ? new Date(share.value.expireAt).toLocaleString() : "长期有效");

  /** 消息文本 */
  const shareMessage = computed(() => {
    if (shareLoading.value) return "自动更新中";
    return shareStatus.value || "修改后自动更新，密码需点确认才生效";
  });

  /** 是否为错误状态 */
  const shareStatusIsError = computed(() => shareStatus.value?.includes("失败") || shareStatus.value?.includes("占用") || shareStatus.value?.includes("保留"));

  // ============= 方法 =============

  /** 保存分享设置 */
  function saveShare(saveOptions: EditorShareSaveOptions = {}) {
    const targetDocUid = current.value?.docUid;
    if (!targetDocUid) return Promise.resolve();
    const sequence = ++saveSequence;
    const targetShareId = share.value?.id;
    const enabledSnapshot = shareEnabled.value;
    const passwordSnapshot = sharePassword.value?.trim() || "";
    const customSlugSnapshot = customSlugInput.value.trim();
    const isAdmin = !!ctx.auth?.isAdmin;
    shareLoading.value = true;
    const operation = async () => {
      const patch = createEditorSharePatch({
        enabled: enabledSnapshot,
        password: passwordSnapshot,
        customSlug: customSlugSnapshot,
        isAdmin,
        ...saveOptions,
      });

      let target = targetShareId ? { id: targetShareId } : null;
      if (!target) {
        const created = await createShareApi(targetDocUid, patch);
        target = created.share;
      }
      await updateShareApi(target.id, patch);
      const response = await getShareByDocApi(targetDocUid);
      if (sequence !== saveSequence || current.value?.docUid !== targetDocUid) return;
      share.value = response.share;
      shareEnabled.value = !!response.share?.isEnabled || (!ctx.auth?.isAdmin && response.share?.reviewStatus === "pending");
      shareCodeInput.value = response.share?.shareCode ? String(response.share.shareCode) : "";
      customSlugInput.value = response.share?.customSlug || "";
      shareHasPassword.value = !!response.share?.hasPassword;
      sharePassword.value = "";
      if (!ctx.auth?.isAdmin && response.share?.reviewStatus === "pending") {
        shareStatus.value = "已提交管理员审核，通过后才会公开。";
      } else {
        if (saveOptions.passwordConfirmed) shareStatus.value = "密码已确认并更新";
        else if (saveOptions.clearPassword) shareStatus.value = "访问密码已清除";
        else if (saveOptions.customSlugConfirmed) shareStatus.value = "链接码已更新";
        else shareStatus.value = "分享设置已更新；未确认密码不会生效";
      }
      ctx.docs?.invalidateDocListCache();
      void ctx.docs?.loadList("", { force: true });
    };

    const run = saveQueue.then(operation, operation);
    saveQueue = run.catch(() => undefined);
    return run.catch((error) => {
      if (sequence === saveSequence && current.value?.docUid === targetDocUid) {
        shareStatus.value = error instanceof Error ? error.message : "分享更新失败";
      }
    }).finally(() => {
      if (sequence === saveSequence && current.value?.docUid === targetDocUid) {
        shareLoading.value = false;
      }
    });
  }

  /** 确认密码 */
  function confirmSharePassword() {
    const pwd = sharePassword.value;
    if (!pwd?.trim()) {
      shareStatus.value = "密码为空，当前按无密码分享";
      void saveShare({ clearPassword: true });
      return;
    }
    void saveShare({ passwordConfirmed: true });
  }

  /** 清空密码 */
  function clearSharePassword() {
    sharePassword.value = "";
    void saveShare({ clearPassword: true });
  }

  /** 保存管理员明确提交的自定义链接码 */
  function saveCustomSlug() {
    void saveShare({ customSlugConfirmed: true });
  }

  /** 密码输入处理 */
  function onPasswordInput() {
    shareStatus.value = sharePassword.value?.trim() ? "密码未确认，不会生效" : "未设置密码";
  }

  /** 复制分享链接 */
  async function copyShare() {
    if (!current.value) return;
    if (!shareEnabled.value) {
      shareStatus.value = "先开启公开分享，再复制链接。";
      panelOpen.value = true;
      return;
    }
    if (!share.value) await saveShare();
    if (!shareUrl.value) {
      shareStatus.value = shareReviewText.value || "分享还未公开，暂时没有可复制链接。";
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl.value);
      shareStatus.value = `已复制 ${shareUrl.value} · ${shareAccessText.value} · ${shareExpiryText.value}`;
      copied.value = true;
      setTimeout(() => { copied.value = false; }, 1600);
    } catch {
      shareStatus.value = "复制失败，请手动复制链接。";
    }
  }

  /** 重新提交被拒绝的分享 */
  function resubmitRejectedShare() {
    shareEnabled.value = true;
    void saveShare();
  }

  // ============= 自动保存 =============

  // 监听 shareEnabled 变化，自动保存分享设置
  let previousShareEnabled = shareEnabled.value;
  watch(shareEnabled, (newValue) => {
    if (newValue === previousShareEnabled) return;
    previousShareEnabled = newValue;
    if (ctx.hydrating.value) return;
    void saveShare();
  });

  return {
    // 计算属性
    shareUrl,
    shareReviewText,
    shareStateText,
    shareAccessText,
    shareExpiryText,
    shareMessage,
    shareStatusIsError,

    // 方法
    saveShare,
    saveCustomSlug,
    confirmSharePassword,
    clearSharePassword,
    onPasswordInput,
    copyShare,
    resubmitRejectedShare,
  };
}
