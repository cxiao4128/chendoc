/**
 * useEditorMobile.ts - 移动端编辑器 UI 状态管理
 *
 * 职责：
 * - 移动端面板状态（文档切换/目录/分享/版本/更多/导出）
 * - 移动端编辑状态（toc、editorKey、deleteConfirm）
 * - 移动端 UI 辅助函数
 */
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { TocItem } from "../types";

export type MobileSheetType = "docs" | "toc" | "share" | "versions" | "more" | "export" | null;

export interface UseEditorMobileOptions {
  /** 分享面板是否打开（来自父组件） */
  sharePanelOpen?: () => boolean;
  /** 分享相关数据 */
  share?: () => { isEnabled?: boolean; reviewStatus?: string } | null;
  /** 文档状态 */
  currentStatus?: () => string | undefined;
}

export interface UseEditorMobileReturn {
  mobileSheet: Ref<MobileSheetType>;
  deleteOpen: Ref<boolean>;
  toc: Ref<TocItem[]>;
  editorKey: Ref<number>;
  mobileSheetTitle: ComputedRef<string>;
  mobileDocBadge: ComputedRef<string>;
  currentStatusText: ComputedRef<string>;
  saveText: ComputedRef<string>;
  editorKeyComputed: ComputedRef<string>;
  closeMobileSheet: () => void;
  openMobileSheet: (sheet: MobileSheetType) => void;
  handleTocUpdate: (newToc: TocItem[]) => void;
  formatDate: (value: string) => string;
}

function mobileSheetTitle(value: MobileSheetType): string {
  if (value === "docs") return "切换文档";
  if (value === "toc") return "目录导航";
  if (value === "share") return "发布设置";
  if (value === "versions") return "历史版本";
  if (value === "more") return "更多操作";
  if (value === "export") return "导出文档";
  return "";
}

export function useEditorMobile(options: UseEditorMobileOptions = {}): UseEditorMobileReturn {
  const { share, currentStatus } = options;
  const mobileSheet = ref<MobileSheetType>(null);
  const deleteOpen = ref(false);
  const toc = ref<TocItem[]>([]);
  const editorKey = ref(0);

  // 分享面板关闭时同步 mobileSheet
  watch(
    () => options.sharePanelOpen?.(),
    (isOpen) => {
      if (!isOpen && mobileSheet.value === "share") {
        mobileSheet.value = null;
      }
    }
  );

  const mobileDocBadge = computed(() => {
    const shareData = share?.();
    if (shareData?.isEnabled) return "公开分享中";
    if (shareData?.reviewStatus === "pending") return "审核中";
    if (shareData?.reviewStatus === "rejected") return "审核未通过";
    return "当前仅内部可见";
  });

  const currentStatusText = computed(() => {
    const status = currentStatus?.();
    return status === "published" ? "已发布" : "草稿";
  });

  const saveText = computed(() => {
    // saveState 由调用方处理，这里只返回空
    return "";
  });

  const editorKeyComputed = computed(() => {
    return `mobile-${editorKey.value}`;
  });

  function closeMobileSheet() {
    mobileSheet.value = null;
  }

  function openMobileSheet(sheet: MobileSheetType) {
    mobileSheet.value = sheet;
  }

  function handleTocUpdate(newToc: TocItem[]) {
    toc.value = newToc;
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString();
  }

  return {
    mobileSheet,
    deleteOpen,
    toc,
    editorKey,
    mobileSheetTitle: computed(() => mobileSheetTitle(mobileSheet.value)),
    mobileDocBadge,
    currentStatusText,
    saveText,
    editorKeyComputed,
    closeMobileSheet,
    openMobileSheet,
    handleTocUpdate,
    formatDate,
  };
}
