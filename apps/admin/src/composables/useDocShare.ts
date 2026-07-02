/**
 * useDocShare.ts - 文档分享状态管理 Composable
 *
 * 增强说明：
 * - 增加防抖保存
 * - 增加链接复制
 * - 增加密码管理
 * - 完善错误处理
 */
import { ref, computed, watch } from "vue";
import type { ShareItem, SharePatch } from "../api/shares";
import { createShareApi, getShareByDocApi, updateShareApi } from "../api/shares";

export interface UseDocShareOptions {
  /** 自动加载，默认 true */
  autoLoad?: boolean;
  /** 防抖延迟（毫秒），默认 700 */
  debounceDelay?: number;
  /** 加载成功回调 */
  onLoaded?: (share: ShareItem | null) => void;
  /** 保存成功回调 */
  onSaved?: (share: ShareItem) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

export function useDocShare(options: UseDocShareOptions = {}) {
  const {
    autoLoad = true,
    debounceDelay = 700,
    onLoaded,
    onSaved,
    onError,
  } = options;

  // 状态
  const share = ref<ShareItem | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  // 表单状态
  const enabled = ref(false);
  const password = ref("");
  const customSlug = ref("");
  const status = ref("");
  const hasPassword = ref(false);

  // 面板状态
  const panelOpen = ref(false);

  // 内部状态
  let debounceTimer: number | null = null;
  let currentDocUid: string | null = null;

  // ============= 计算属性 =============
  const shareUrl = computed(() => {
    if (!share.value?.isEnabled) return "";
    const key = share.value.customSlug || share.value.shareCode;
    return `${location.origin}/r/${key}`;
  });

  const canSharePublicly = computed(() => !!shareUrl.value && share.value?.isEnabled);

  const reviewStatusText = computed(() => {
    if (!share.value?.reviewStatus || share.value.reviewStatus === "approved") return "";
    if (share.value.reviewStatus === "pending") return "等待管理员审核，通过后才会公开。";
    if (share.value.reviewStatus === "rejected") {
      return share.value.reviewNote
        ? `审核未通过：${share.value.reviewNote}`
        : "审核未通过，可修改后重新提交。";
    }
    return "";
  });

  const accessText = computed(() => {
    if (!share.value?.isEnabled) return "当前无人可访问";
    return hasPassword.value ? "持有链接和密码的人" : "持有链接的人";
  });

  const expiryText = computed(() => {
    if (!share.value?.expireAt) return "长期有效";
    return formatDate(share.value.expireAt);
  });

  const message = computed(() => {
    if (loading.value || saving.value) return "自动更新中";
    if (error.value) return error.value;
    return status.value || "修改后自动更新，密码需点确认才生效";
  });

  const isStatusError = computed(() => {
    return status.value.includes("失败") || status.value.includes("占用") || status.value.includes("保留");
  });

  // ============= 加载分享信息 =============
  async function load(docUid: string): Promise<ShareItem | null> {
    currentDocUid = docUid;
    loading.value = true;
    error.value = null;
    status.value = "";

    try {
      const response = await getShareByDocApi(docUid);
      share.value = response.share;
      syncFromShare(response.share);
      onLoaded?.(response.share);
      return response.share;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e.message;
      status.value = "分享信息加载失败，可稍后重试。";
      onError?.(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  // ============= 同步表单状态 =============
  function syncFromShare(s: ShareItem | null) {
    if (!s) {
      enabled.value = false;
      password.value = "";
      customSlug.value = "";
      hasPassword.value = false;
      return;
    }

    enabled.value = !!s.isEnabled;
    customSlug.value = s.customSlug || "";
    hasPassword.value = !!s.hasPassword;
    // 不同步密码，已设置的密码不应该回显
  }

  // ============= 确保分享存在 =============
  async function ensureShare(docUid: string): Promise<ShareItem | null> {
    if (share.value) return share.value;

    try {
      const created = await createShareApi(docUid);
      share.value = created.share;
      return created.share;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e.message;
      onError?.(e);
      return null;
    }
  }

  // ============= 保存分享设置（防抖）=============
  async function save(options: { passwordConfirmed?: boolean; clearPassword?: boolean } = {}) {
    if (!currentDocUid) return;

    const docUid = currentDocUid;
    saving.value = true;
    error.value = null;

    try {
      // 如果要启用分享，先确保分享存在
      const target = enabled.value ? await ensureShare(docUid) : share.value;
      if (!target) return;

      const patch: SharePatch = {
        isEnabled: enabled.value,
        expireAt: null,
      };

      if (options.passwordConfirmed && password.value.trim()) {
        patch.password = password.value.trim();
      }

      if (options.clearPassword) {
        patch.password = null;
      }

      if (customSlug.value.trim()) {
        patch.customSlug = customSlug.value.trim();
      }

      await updateShareApi(target.id, patch);

      // 重新获取最新分享状态
      const response = await getShareByDocApi(docUid);
      share.value = response.share;
      syncFromShare(response.share);

      // 清除密码输入
      password.value = "";

      // 设置成功状态
      if (response.share?.reviewStatus === "pending") {
        status.value = "已提交管理员审核，通过后才会公开。";
      } else if (options.passwordConfirmed) {
        status.value = "密码已确认并更新";
      } else {
        status.value = "已自动更新，无访问密码";
      }

      onSaved?.(response.share ?? share.value!);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e.message;
      status.value = e.message;
      onError?.(e);
    } finally {
      saving.value = false;
    }
  }

  // ============= 防抖保存 =============
  function scheduleSave() {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }
    status.value = "等待自动更新";
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      void save();
    }, debounceDelay);
  }

  // ============= 确认密码 =============
  async function confirmPassword() {
    if (!password.value.trim()) {
      status.value = "密码为空，当前按无密码分享";
      await save({ clearPassword: true });
      return;
    }
    await save({ passwordConfirmed: true });
  }

  // ============= 清除密码 =============
  async function clearPassword() {
    password.value = "";
    await save({ clearPassword: true });
  }

  // ============= 复制链接 =============
  async function copyLink(): Promise<boolean> {
    if (!share.value?.isEnabled) {
      status.value = "先开启公开分享，再复制链接。";
      panelOpen.value = true;
      return false;
    }

    if (!shareUrl.value) {
      status.value = reviewStatusText.value || "分享还未公开，暂时没有可复制链接。";
      return false;
    }

    try {
      await navigator.clipboard.writeText(shareUrl.value);
      status.value = `已复制 ${shareUrl.value} · ${accessText.value} · ${expiryText.value}`;
      return true;
    } catch (err) {
      status.value = "复制失败，请手动复制链接。";
      return false;
    }
  }

  // ============= 重新提交审核 =============
  async function resubmitForReview() {
    enabled.value = true;
    await save();
  }

  // ============= 打开/关闭面板 =============
  function openPanel() {
    panelOpen.value = true;
  }

  function closePanel() {
    panelOpen.value = false;
  }

  function togglePanel() {
    panelOpen.value = !panelOpen.value;
  }

  // ============= 格式化 =============
  function formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  // ============= 重置 =============
  function reset() {
    share.value = null;
    loading.value = false;
    saving.value = false;
    error.value = null;
    enabled.value = false;
    password.value = "";
    customSlug.value = "";
    status.value = "";
    hasPassword.value = false;
    panelOpen.value = false;
    currentDocUid = null;
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  // ============= 监听 enabled 变化自动保存 =============
  if (autoLoad) {
    watch(enabled, () => {
      if (currentDocUid) {
        scheduleSave();
      }
    });

    watch(customSlug, () => {
      if (currentDocUid) {
        scheduleSave();
      }
    });
  }

  // ============= 导出 =============
  return {
    // 状态
    share,
    loading,
    saving,
    error,

    // 表单状态
    enabled,
    password,
    customSlug,
    status,
    hasPassword,

    // 面板状态
    panelOpen,

    // 计算属性
    shareUrl,
    canSharePublicly,
    reviewStatusText,
    accessText,
    expiryText,
    message,
    isStatusError,

    // 方法
    load,
    save,
    scheduleSave,
    ensureShare,
    confirmPassword,
    clearPassword,
    copyLink,
    resubmitForReview,
    openPanel,
    closePanel,
    togglePanel,
    reset,

    // 格式化
    formatDate,
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
