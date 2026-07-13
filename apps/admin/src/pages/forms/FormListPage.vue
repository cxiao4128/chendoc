<script setup lang="ts">
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { useFormList } from "../../features/forms";
import FormListFilters from "./components/FormListFilters.vue";
import FormListHeader from "./components/FormListHeader.vue";
import FormListTable from "./components/FormListTable.vue";
import FormListToolbar from "./components/FormListToolbar.vue";
import "./css/form-list.css";

const {
  activeView,
  visibleForms,
  loading,
  compactMode,
  selectedFormIds,
  bulkMode,
  deleteDialogOpen,
  bulkDeleteOpen,
  bulkDeleting,
  copiedUid,
  totalCount,
  publishedCount,
  draftCount,
  closedCount,
  selectedCount,
  errorText,
  sortLabel,
  cycleSortMode,
  retryLoad,
  createForm,
  editForm,
  viewSubmissions,
  copyLink,
  openOrToggleForm,
  toggleFormSelection,
  toggleAllVisibleForms,
  cancelBulkMode,
  doDeleteForm,
  onBulkDeleteClick,
  confirmBulkDelete,
  resetFilters
} = useFormList();
</script>

<template>
  <section class="doc-list-page form-list-page">
    <FormListHeader
      :bulk-mode="bulkMode"
      :selected-count="selectedCount"
      :visible-count="visibleForms.length"
      :bulk-deleting="bulkDeleting"
      @bulk-delete="onBulkDeleteClick"
      @toggle-all="toggleAllVisibleForms"
      @cancel-bulk="cancelBulkMode"
      @create="createForm"
    />

    <FormListFilters
      v-model="activeView"
      :total-count="totalCount"
      :published-count="publishedCount"
      :draft-count="draftCount"
      :closed-count="closedCount"
      @create="createForm"
    />

    <div class="doc-list-page__workspace is-toolbox-collapsed">
      <div class="doc-list-page__ledger">
        <FormListToolbar
          v-model:compact-mode="compactMode"
          :sort-label="sortLabel"
          @cycle-sort="cycleSortMode"
          @reset-filters="resetFilters"
        />

        <FormListTable
          :loading="loading"
          :error-text="errorText"
          :visible-forms="visibleForms"
          :compact-mode="compactMode"
          :selected-form-ids="selectedFormIds"
          :bulk-mode="bulkMode"
          :copied-uid="copiedUid"
          @retry-load="retryLoad"
          @create="createForm"
          @open-or-toggle="openOrToggleForm"
          @toggle-selection="toggleFormSelection"
          @edit="editForm"
          @view-submissions="viewSubmissions"
          @copy-link="copyLink"
        />
      </div>
    </div>

    <ConfirmDialog
      v-model="deleteDialogOpen"
      danger
      title="确认删除"
      message="删除后无法恢复，确定要删除这个表单吗？"
      confirm-text="删除"
      @confirm="doDeleteForm"
    />

    <ConfirmDialog
      v-model="bulkDeleteOpen"
      danger
      title="批量删除"
      :message="`确认将选中的 ${selectedCount} 个表单删除吗？删除后无法恢复。`"
      confirm-text="批量删除"
      @confirm="confirmBulkDelete"
    />
  </section>
</template>
