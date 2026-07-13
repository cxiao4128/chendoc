import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormItem, IpStats, SubmissionItem } from "../../../services/api/forms.api";
import { formsApi } from "../../../services/api/forms.api";
import { nativeConfirm } from "../../../services/nativeDialog";

export type FormSubmissionsTab = "submissions" | "sources";
export type FormExportFormat = "csv" | "json" | "xlsx";

export function formatFormDate(dateStr: string) {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatFieldValue(value: unknown) {
  if (Array.isArray(value)) return value.length ? value.join("、") : "-";
  if (value === true) return "是";
  if (value === false) return "否";
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function escapeHtml(text: string) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useFormSubmissions() {
  const router = useRouter();
  const route = useRoute();
  const formId = computed(() => Number(route.params.id));
  const form = ref<FormItem | null>(null);
  const inputFields = computed(() => form.value?.fields.filter((field) => field.type !== "section") || []);
  const submissions = ref<SubmissionItem[]>([]);
  const ipStats = ref<IpStats[]>([]);
  const pagination = ref({ page: 1, pageSize: 20, hasMore: false });
  const loading = ref(true);
  const loadingMore = ref(false);
  const exporting = ref(false);
  const activeTab = ref<FormSubmissionsTab>("submissions");
  const error = ref("");
  const detailDialogOpen = ref(false);
  const selectedSubmission = ref<SubmissionItem | null>(null);
  const deleteDialogOpen = ref(false);
  const deletingSubmissionId = ref<number | null>(null);
  const deleting = ref(false);

  async function loadData() {
    loading.value = true;
    error.value = "";
    try {
      const [submissionResponse, ipResponse] = await Promise.all([
        formsApi.submissions(formId.value, { page: pagination.value.page, pageSize: pagination.value.pageSize }),
        formsApi.ipStats(formId.value)
      ]);
      form.value = submissionResponse.form;
      submissions.value = submissionResponse.submissions;
      pagination.value = submissionResponse.pagination;
      ipStats.value = ipResponse.stats;
    } catch (loadError) {
      error.value = loadError instanceof Error ? loadError.message : "加载失败";
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    if (!pagination.value.hasMore || loadingMore.value) return;
    loadingMore.value = true;
    pagination.value.page++;
    try {
      const response = await formsApi.submissions(formId.value, { page: pagination.value.page, pageSize: pagination.value.pageSize });
      submissions.value.push(...response.submissions);
      pagination.value = response.pagination;
    } catch (loadError) {
      pagination.value.page--;
      error.value = loadError instanceof Error ? loadError.message : "加载更多失败";
    } finally {
      loadingMore.value = false;
    }
  }

  async function exportData(format: FormExportFormat) {
    const confirmed = await nativeConfirm({
      title: "导出提交记录",
      message: `将导出 ${form.value?.submissionCount || submissions.value.length} 条记录，文件包含填写内容、提交时间和来源摘要${format === "json" || format === "csv" ? "，开启记录时还会包含浏览器信息" : ""}。请妥善保存。`,
      confirmText: "导出记录"
    });
    if (!confirmed) return;
    exporting.value = true;
    try {
      const response = await formsApi.export(formId.value, format);
      const fields = response.form.fields.filter((field) => field.type !== "section");
      const fileBase = form.value?.title || "表单";

      if (format === "json") {
        downloadBlob(new Blob([JSON.stringify(response, null, 2)], { type: "application/json" }), `${fileBase}_导出.json`);
        return;
      }

      if (format === "csv") {
        const headers = ["提交时间", "来源摘要", "浏览器信息", ...fields.map((field) => field.label)];
        const rows = response.submissions.map((submission) => {
          const row = [formatFormDate(submission.submittedAt), submission.ip, submission.userAgent || ""];
          fields.forEach((field) => {
            const value = submission.data[field.id];
            row.push(Array.isArray(value) ? value.join("; ") : value !== null && value !== undefined ? String(value) : "");
          });
          return row;
        });
        const csvContent = [
          headers.map((header) => `"${String(header).replace(/"/g, '""')}"`).join(","),
          ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        ].join("\n");
        downloadBlob(new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" }), `${fileBase}_导出.csv`);
        return;
      }

      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table>`;
      html += "<thead><tr><th>提交时间</th><th>来源摘要</th>";
      fields.forEach((field) => {
        html += `<th>${escapeHtml(field.label)}</th>`;
      });
      html += "</tr></thead><tbody>";
      response.submissions.forEach((submission) => {
        html += `<tr><td>${formatFormDate(submission.submittedAt)}</td><td>${escapeHtml(submission.ip)}</td>`;
        fields.forEach((field) => {
          const value = submission.data[field.id];
          const displayValue = Array.isArray(value) ? value.join("; ") : value !== null && value !== undefined ? String(value) : "";
          html += `<td>${escapeHtml(displayValue)}</td>`;
        });
        html += "</tr>";
      });
      html += "</tbody></table></body></html>";
      downloadBlob(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }), `${fileBase}_导出.xls`);
    } catch (exportError) {
      error.value = exportError instanceof Error ? exportError.message : "导出失败";
    } finally {
      exporting.value = false;
    }
  }

  function viewDetail(submission: SubmissionItem) {
    selectedSubmission.value = submission;
    detailDialogOpen.value = true;
  }

  function confirmDelete(submission: SubmissionItem) {
    deletingSubmissionId.value = submission.id;
    selectedSubmission.value = submission;
    deleteDialogOpen.value = true;
  }

  async function doDeleteSubmission() {
    if (!deletingSubmissionId.value) return;
    deleting.value = true;
    try {
      await formsApi.deleteSubmission(formId.value, deletingSubmissionId.value);
      submissions.value = submissions.value.filter((submission) => submission.id !== deletingSubmissionId.value);
      if (form.value) form.value.submissionCount = Math.max(0, form.value.submissionCount - 1);
    } catch (deleteError) {
      error.value = deleteError instanceof Error ? deleteError.message : "删除失败";
    } finally {
      deleteDialogOpen.value = false;
      deletingSubmissionId.value = null;
      deleting.value = false;
    }
  }

  async function deleteAllSubmissions() {
    const confirmed = await nativeConfirm({
      title: "删除全部个人数据",
      message: "将永久删除此表单的全部提交记录，无法恢复。",
      confirmText: "全部删除",
      danger: true
    });
    if (!confirmed) return;
    deleting.value = true;
    try {
      await formsApi.deleteAllSubmissions(formId.value);
      submissions.value = [];
      ipStats.value = [];
      if (form.value) form.value.submissionCount = 0;
    } catch (deleteError) {
      error.value = deleteError instanceof Error ? deleteError.message : "删除失败";
    } finally {
      deleting.value = false;
    }
  }

  onMounted(loadData);

  return {
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
    deleteAllSubmissions,
    formatFormDate,
    formatFieldValue
  };
}
