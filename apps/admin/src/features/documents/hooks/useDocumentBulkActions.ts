import { computed, ref } from "vue";
import type { DocSummary } from "../../../api/docs";

export function useDocumentBulkActions(options: { bulkDeleteDocs: (docUids: string[]) => Promise<string[]> }) {
  const bulkMode = ref(false);
  const selectedDocUids = ref<Set<string>>(new Set());
  const bulkDeleteOpen = ref(false);
  const bulkDeleting = ref(false);
  const selectedCount = computed(() => selectedDocUids.value.size);

  function enterBulkMode() {
    bulkMode.value = true;
  }

  function cancelBulkMode() {
    bulkMode.value = false;
    setSelectedDocUids([]);
    bulkDeleteOpen.value = false;
  }

  function toggleDocSelection(docUid: string) {
    const next = new Set(selectedDocUids.value);
    if (next.has(docUid)) next.delete(docUid);
    else next.add(docUid);
    selectedDocUids.value = next;
  }

  function allVisibleSelected(visibleDocs: DocSummary[]): boolean {
    return !!visibleDocs.length && visibleDocs.every((doc) => selectedDocUids.value.has(doc.docUid));
  }

  function toggleAllVisibleDocs(visibleDocs: DocSummary[]) {
    setSelectedDocUids(allVisibleSelected(visibleDocs) ? [] : visibleDocs.map((doc) => doc.docUid));
  }

  function setSelectedDocUids(nextUids: Iterable<string>) {
    selectedDocUids.value = new Set(nextUids);
  }

  function onBulkDeleteClick() {
    if (!bulkMode.value) {
      enterBulkMode();
      return;
    }
    if (selectedCount.value) bulkDeleteOpen.value = true;
  }

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
    bulkMode,
    selectedDocUids,
    bulkDeleteOpen,
    bulkDeleting,
    selectedCount,
    enterBulkMode,
    cancelBulkMode,
    toggleDocSelection,
    toggleAllVisibleDocs,
    allVisibleSelected,
    setSelectedDocUids,
    onBulkDeleteClick,
    confirmBulkDelete
  };
}
