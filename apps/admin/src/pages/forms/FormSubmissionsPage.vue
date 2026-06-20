<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ArrowLeft, Download, RefreshCw, Eye, Trash2 } from "lucide-vue-next";
import {
  listSubmissionsApi, exportFormApi, getIpStatsApi, deleteSubmissionApi, deleteAllSubmissionsApi, type FormItem, type SubmissionItem, type IpStats
} from "../../api/forms";
import { nativeConfirm } from "../../services/nativeDialog";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import "./css/form-submissions.css";

const router = useRouter();
const route = useRoute();
const formId = computed(() => Number(route.params.id));

// 数据
const form = ref<FormItem | null>(null);
const submissions = ref<SubmissionItem[]>([]);
const ipStats = ref<IpStats[]>([]);
const pagination = ref({ page: 1, pageSize: 20, hasMore: false });

// UI状态
const loading = ref(true);
const exporting = ref(false);
const activeTab = ref<"submissions" | "ip">("submissions");
const error = ref("");

// 详情弹窗
const detailDialogOpen = ref(false);
const selectedSubmission = ref<SubmissionItem | null>(null);

// 删除确认
const deleteDialogOpen = ref(false);
const deletingSubmissionId = ref<number | null>(null);
const deleting = ref(false);

async function loadData() {
  loading.value = true;
  error.value = "";
  try {
    const [subRes, ipRes] = await Promise.all([
      listSubmissionsApi(formId.value, { page: pagination.value.page, pageSize: pagination.value.pageSize }),
      getIpStatsApi(formId.value)
    ]);
    form.value = subRes.form;
    submissions.value = subRes.submissions;
    pagination.value = subRes.pagination;
    ipStats.value = ipRes.stats;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!pagination.value.hasMore) return;
  pagination.value.page++;
  try {
    const res = await listSubmissionsApi(formId.value, { page: pagination.value.page, pageSize: pagination.value.pageSize });
    submissions.value.push(...res.submissions);
    pagination.value = res.pagination;
  } catch {
    pagination.value.page--;
  }
}

async function exportData(format: "csv" | "json" | "xlsx") {
  const confirmed = await nativeConfirm({
    title: "导出提交记录",
    message: `将导出 ${form.value?.submissionCount || submissions.value.length} 条记录，文件包含填写内容和提交时间${format === "json" || format === "csv" ? "，并包含 IP 与浏览器信息" : ""}。请妥善保存。`,
    confirmText: "导出记录"
  });
  if (!confirmed) return;
  exporting.value = true;
  try {
    const res = await exportFormApi(formId.value, format);
    let blob: Blob;
    let filename: string;

    if (format === "json") {
      // 直接下载JSON
      blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
      filename = `${form.value?.title || "表单"}_导出.json`;
    } else if (format === "csv") {
      // 生成CSV
      const fields = res.form.fields;
      const headers = ["提交时间", "IP地址", "User Agent", ...fields.map(f => f.label)];
      const rows = res.submissions.map(sub => {
        const row = [
          formatDate(sub.submittedAt),
          sub.ip,
          sub.userAgent || "",
        ];
        fields.forEach(field => {
          const value = sub.data[field.id];
          if (Array.isArray(value)) {
            row.push(value.join("; "));
          } else if (value !== null && value !== undefined) {
            row.push(String(value));
          } else {
            row.push("");
          }
        });
        return row;
      });

      // CSV编码：处理特殊字符并添加BOM
      const csvContent = [
        headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(","),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      // 添加UTF-8 BOM以支持Excel正确打开中文
      const bom = "﻿";
      blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8" });
      filename = `${form.value?.title || "表单"}_导出.csv`;
    } else {
      // 生成Excel (使用SheetJS格式的HTML表格方式)
      const fields = res.form.fields;
      let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table>`;
      html += "<thead><tr>";
      html += "<th>提交时间</th><th>IP地址</th>";
      fields.forEach(f => { html += `<th>${escapeHtml(f.label)}</th>`; });
      html += "</tr></thead><tbody>";
      res.submissions.forEach(sub => {
        html += "<tr>";
        html += `<td>${formatDate(sub.submittedAt)}</td><td>${escapeHtml(sub.ip)}</td>`;
        fields.forEach(field => {
          const value = sub.data[field.id];
          const displayValue = Array.isArray(value) ? value.join("; ") : (value !== null && value !== undefined ? String(value) : "");
          html += `<td>${escapeHtml(displayValue)}</td>`;
        });
        html += "</tr>";
      });
      html += "</tbody></table></body></html>";
      blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
      filename = `${form.value?.title || "表单"}_导出.xls`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "导出失败";
  } finally {
    exporting.value = false;
  }
}

function escapeHtml(text: string) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatFieldValue(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : String(value || "-");
}

// 查看详情
function viewDetail(submission: SubmissionItem) {
  selectedSubmission.value = submission;
  detailDialogOpen.value = true;
}

// 删除单条记录
function confirmDelete(submission: SubmissionItem) {
  deletingSubmissionId.value = submission.id;
  selectedSubmission.value = submission;
  deleteDialogOpen.value = true;
}

async function doDeleteSubmission() {
  if (!deletingSubmissionId.value) return;
  deleting.value = true;
  try {
    await deleteSubmissionApi(formId.value, deletingSubmissionId.value);
    // 移除已删除的记录
    submissions.value = submissions.value.filter(s => s.id !== deletingSubmissionId.value);
    if (form.value) {
      form.value.submissionCount--;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "删除失败";
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
    await deleteAllSubmissionsApi(formId.value);
    submissions.value = [];
    ipStats.value = [];
    if (form.value) form.value.submissionCount = 0;
  } finally {
    deleting.value = false;
  }
}

onMounted(loadData);
</script>

<template>
  <div class="form-submissions">
    <!-- 顶部栏 -->
    <header class="page-header">
      <div class="header-left">
        <button class="icon-btn" @click="router.push('/admin/forms')">
          <ArrowLeft :size="18" />
        </button>
        <h1>{{ form?.title || "提交结果" }}</h1>
      </div>
      <div class="header-actions">
        <button class="cd-button" @click="loadData" :disabled="loading">
          <RefreshCw :size="16" :class="{ spinning: loading }" /> 刷新
        </button>
        <button class="cd-button danger" :disabled="deleting || !submissions.length" @click="deleteAllSubmissions"><Trash2 :size="16" /> 删除全部数据</button>
        <div class="export-dropdown">
          <button class="cd-button cd-button-primary" :disabled="exporting">
            <Download :size="16" /> 导出
          </button>
          <div class="export-menu">
            <button @click="exportData('csv')">导出 CSV</button>
            <button @click="exportData('json')">导出 JSON</button>
            <button @click="exportData('xlsx')">导出 Excel</button>
          </div>
        </div>
      </div>
    </header>

    <div v-if="loading && !form" class="loading-state">
      <div class="cd-skeleton skeleton-line"></div>
      <div class="cd-skeleton skeleton-line"></div>
    </div>

    <div v-else-if="error" class="error-state">{{ error }}</div>

    <template v-else>
      <!-- 统计卡片 -->
      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-value">{{ form?.submissionCount || 0 }}</div>
          <div class="stat-label">提交数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ form?.viewCount || 0 }}</div>
          <div class="stat-label">访问数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ ipStats.length }}</div>
          <div class="stat-label">来源数</div>
        </div>
      </div>

      <!-- 标签页 -->
      <div class="tabs">
        <button :class="['tab', { active: activeTab === 'submissions' }]" @click="activeTab = 'submissions'">
          提交记录
        </button>
        <button :class="['tab', { active: activeTab === 'ip' }]" @click="activeTab = 'ip'">
          IP统计
        </button>
      </div>

      <!-- 提交记录 -->
      <div v-if="activeTab === 'submissions'" class="tab-content">
        <div v-if="submissions.length === 0" class="empty-state">
          还没有人提交
        </div>

        <div v-else class="submissions-table">
          <div class="submissions-mobile-list">
            <article v-for="sub in submissions" :key="sub.id" @click="viewDetail(sub)">
              <header><strong>提交 #{{ sub.id }}</strong><time>{{ formatDate(sub.submittedAt) }}</time></header>
              <dl>
                <div v-for="field in form?.fields.slice(0, 3)" :key="field.id">
                  <dt>{{ field.label }}</dt>
                  <dd>{{ formatFieldValue(sub.data[field.id]) }}</dd>
                </div>
              </dl>
              <footer>
                <button class="cd-button" type="button" @click.stop="viewDetail(sub)"><Eye :size="14" />查看详情</button>
                <button class="cd-button danger" type="button" @click.stop="confirmDelete(sub)"><Trash2 :size="14" />删除</button>
              </footer>
            </article>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th v-for="field in form?.fields" :key="field.id">{{ field.label }}</th>
                <th>来源摘要</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(sub, index) in submissions" :key="sub.id">
                <td>{{ (pagination.page - 1) * pagination.pageSize + index + 1 }}</td>
                <td v-for="field in form?.fields" :key="field.id">
                  {{ formatFieldValue(sub.data[field.id]) }}
                </td>
                <td class="ip-cell">{{ sub.ip }}</td>
                <td>{{ formatDate(sub.submittedAt) }}</td>
                <td class="action-cell">
                  <button class="action-btn" title="查看详情" @click="viewDetail(sub)">
                    <Eye :size="14" />
                  </button>
                  <button class="action-btn danger" title="删除" @click="confirmDelete(sub)">
                    <Trash2 :size="14" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="pagination.hasMore" class="load-more">
            <button class="cd-button" @click="loadMore">加载更多</button>
          </div>
        </div>
      </div>

      <!-- IP统计 -->
      <div v-if="activeTab === 'ip'" class="tab-content">
        <div v-if="ipStats.length === 0" class="empty-state">
          暂无IP统计数据
        </div>

        <div v-else class="ip-table">
          <table>
            <thead>
              <tr>
                <th>来源摘要</th>
                <th>提交次数</th>
                <th>首次提交</th>
                <th>最近提交</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="stat in ipStats" :key="stat.ip">
                <td class="ip-cell">{{ stat.ip }}</td>
                <td>{{ stat.count }}</td>
                <td>{{ formatDate(stat.firstAt) }}</td>
                <td>{{ formatDate(stat.lastAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 详情弹窗 -->
    <Teleport to="body">
      <div v-if="detailDialogOpen" class="detail-dialog-overlay" @click="detailDialogOpen = false">
        <div class="detail-dialog" @click.stop>
          <div class="detail-dialog__header">
            <h3>提交详情</h3>
            <button class="detail-dialog__close" @click="detailDialogOpen = false">&times;</button>
          </div>
          <div class="detail-dialog__body">
            <div class="detail-dialog__meta">
              <span>提交时间: {{ selectedSubmission ? formatDate(selectedSubmission.submittedAt) : '' }}</span>
              <span>来源摘要: {{ selectedSubmission?.ip }}</span>
              <span>User Agent: {{ selectedSubmission?.userAgent || "未记录" }}</span>
            </div>
            <div class="detail-dialog__content">
              <div v-for="field in form?.fields" :key="field.id" class="detail-dialog__item">
                <div class="detail-dialog__label">{{ field.label }}</div>
                <div class="detail-dialog__value">
                  {{ formatFieldValue(selectedSubmission?.data[field.id]) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认弹窗 -->
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
