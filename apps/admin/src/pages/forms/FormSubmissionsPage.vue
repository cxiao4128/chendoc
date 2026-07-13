<script setup lang="ts">
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { useFormSubmissions } from "../../features/forms";
import FormSourcesTable from "./components/FormSourcesTable.vue";
import FormSubmissionDetailDialog from "./components/FormSubmissionDetailDialog.vue";
import FormSubmissionsHeader from "./components/FormSubmissionsHeader.vue";
import FormSubmissionsStats from "./components/FormSubmissionsStats.vue";
import FormSubmissionsTable from "./components/FormSubmissionsTable.vue";
import "./css/form-submissions.css";

const {
  router,
  form,
  inputFields,
  submissions,
  ipStats,
  pagination,
  loading,
  loadingMore,
  exporting,
  activeTab,
  error,
  detailDialogOpen,
  selectedSubmission,
  deleteDialogOpen,
  deleting,
  loadData,
  loadMore,
  exportData,
  viewDetail,
  confirmDelete,
  doDeleteSubmission,
  deleteAllSubmissions
} = useFormSubmissions();
</script>

<template>
  <div class="form-submissions">
    <FormSubmissionsHeader
      :title="form?.title || '提交结果'"
      :loading="loading"
      :deleting="deleting"
      :exporting="exporting"
      :submission-count="form?.submissionCount || 0"
      @back="router.push('/admin/forms')"
      @refresh="loadData"
      @delete-all="deleteAllSubmissions"
      @export-data="exportData"
    />

    <div v-if="loading && !form" class="loading-state">
      <div class="cd-skeleton skeleton-line"></div>
      <div class="cd-skeleton skeleton-line"></div>
    </div>

    <div v-else-if="error" class="error-state">{{ error }}</div>

    <template v-else>
      <FormSubmissionsStats
        :submission-count="form?.submissionCount || 0"
        :view-count="form?.viewCount || 0"
        :source-count="ipStats.length"
      />

      <div class="tabs">
        <button :class="['tab', { active: activeTab === 'submissions' }]" @click="activeTab = 'submissions'">
          提交记录
        </button>
        <button :class="['tab', { active: activeTab === 'sources' }]" @click="activeTab = 'sources'">
          来源统计
        </button>
      </div>

      <FormSubmissionsTable
        v-if="activeTab === 'submissions'"
        :submissions="submissions"
        :input-fields="inputFields"
        :pagination="pagination"
        :loading-more="loadingMore"
        @view-detail="viewDetail"
        @delete-submission="confirmDelete"
        @load-more="loadMore"
      />

      <FormSourcesTable v-if="activeTab === 'sources'" :ip-stats="ipStats" />
    </template>

    <FormSubmissionDetailDialog
      v-model="detailDialogOpen"
      :selected-submission="selectedSubmission"
      :input-fields="inputFields"
    />

    <ConfirmDialog
      v-model="deleteDialogOpen"
      danger
      title="确认删除"
      message="确定要删除这条提交记录吗？删除后无法恢复。"
      confirm-text="删除"
      :confirm-loading="deleting"
      @confirm="doDeleteSubmission"
    />
  </div>
</template>
