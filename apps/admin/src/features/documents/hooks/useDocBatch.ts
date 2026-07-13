/**
 * features/documents/hooks/useDocBatch.ts
 *
 * 职责：文档批量选择操作
 */
import { computed, ref } from "vue";
import type { DocSummary } from "@/services/api";

export function useDocBatch(options: { bulkDeleteDocs: (docUids: string[]) => Promise<string[]> }) {
  // ============= 状态 =============

  const bulkMode = ref(false);
  const selectedDocUids = ref<Set<string>>(new Set());
  const bulkDeleteOpen = ref(false);
  const bulkDeleting = ref(false);

  // ============= 计算属性 =============

  const selectedCount = computed(() => selectedDocUids.value.size);

  // ============= 方法 =============

  /** 进入批量模式 */
  function enterBulkMode() {
    bulkMode.value = true;
  }

  /** 退出批量模式 */
  function cancelBulkMode() {
    bulkMode.value = false;
    setSelectedDocUids([]);
    bulkDeleteOpen.value = false;
  }

  /** 切换文档选择状态 */
  function toggleDocSelection(docUid: string) {
    const next = new Set(selectedDocUids.value);
    if (next.has(docUid)) next.delete(docUid);
    else next.add(docUid);
    selectedDocUids.value = next;
  }

  /** 检查是否全部可见文档已选中 */
  function allVisibleSelected(visibleDocs: DocSummary[]): boolean {
    return !!visibleDocs.length && visibleDocs.every((doc) => selectedDocUids.value.has(doc.docUid));
  }

  /** 切换全选/取消全选 */
  function toggleAllVisibleDocs(visibleDocs: DocSummary[]) {
    setSelectedDocUids(allVisibleSelected(visibleDocs) ? [] : visibleDocs.map((doc) => doc.docUid));
  }

  /** 设置选中文档 */
  function setSelectedDocUids(nextUids: Iterable<string>) {
    selectedDocUids.value = new Set(nextUids);
  }

  /** 批量删除按钮点击 */
  function onBulkDeleteClick() {
    if (!bulkMode.value) {
      enterBulkMode();
      return;
    }
    if (selectedCount.value) bulkDeleteOpen.value = true;
  }

  /** 确认批量删除 */
  async function confirmBulkDelete(): Promise<boolean> {
    const docUids = Array.from(selectedDocUids.value);
    if (!docUids.length) return false;
    bulkDeleting.value = true;
    try {
      const deletedDocUids = await options.bulkDeleteDocs(docUids);
      const deletedUidSet = new Set(deletedDocUids);
      setSelectedDocUids(docUids.filter((uid) => !deletedUidSet.has(uid)));
      if (!selectedDocUids.value.size) cancelBulkMode();
      return true;
    } finally {
      bulkDeleting.value = false;
    }
  }

  return {
    // 状态
    bulkMode,
    selectedDocUids,
    bulkDeleteOpen,
    bulkDeleting,
    selectedCount,

    // 方法
    enterBulkMode,
    cancelBulkMode,
    toggleDocSelection,
    toggleAllVisibleDocs,
    allVisibleSelected,
    setSelectedDocUids,
    onBulkDeleteClick,
    confirmBulkDelete,
  };
}
