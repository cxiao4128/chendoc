<script setup lang="ts">
import { useCommentModeration } from "../../features/comments";
import CommentManageHeader from "./components/CommentManageHeader.vue";
import CommentManagePagination from "./components/CommentManagePagination.vue";
import CommentManageTable from "./components/CommentManageTable.vue";
import CommentManageToolbar from "./components/CommentManageToolbar.vue";
import "./comment-manage.css";

const {
  comments,
  loading,
  error,
  selectedIds,
  currentPage,
  totalPages,
  total,
  filterDocUid,
  filterStatus,
  filterKeyword,
  showFilterPanel,
  pageNumbers,
  hasActiveFilters,
  handleSearch,
  toggleSelectAll,
  toggleSelect,
  handleDelete,
  handleBatchDelete,
  goToDoc,
  goToPage,
  goPreviousPage,
  goNextPage
} = useCommentModeration();
</script>

<template>
  <div class="comment-manage">
    <CommentManageHeader :total="total" />

    <CommentManageToolbar
      v-model:filter-keyword="filterKeyword"
      v-model:filter-doc-uid="filterDocUid"
      v-model:filter-status="filterStatus"
      v-model:show-filter-panel="showFilterPanel"
      :selected-count="selectedIds.size"
      :has-active-filters="hasActiveFilters"
      @search="handleSearch"
      @batch-delete="handleBatchDelete"
    />

    <p v-if="error" class="cd-alert cd-alert--danger">{{ error }}</p>

    <CommentManageTable
      :comments="comments"
      :selected-ids="selectedIds"
      :loading="loading"
      @toggle-select-all="toggleSelectAll"
      @toggle-select="toggleSelect"
      @go-to-doc="goToDoc"
      @delete-comment="handleDelete"
    />

    <CommentManagePagination
      :current-page="currentPage"
      :total-pages="totalPages"
      :total="total"
      :page-numbers="pageNumbers"
      @previous="goPreviousPage"
      @next="goNextPage"
      @go-to-page="goToPage"
    />
  </div>
</template>
