<script setup lang="ts">
// ChenDoc v3.0.0 - 评论管理页面
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { MessageSquare, Search, Trash2, ChevronLeft, ChevronRight, Filter, Eye, EyeOff } from "lucide-vue-next";
import { listAllComments, deleteCommentAdmin, deleteCommentsBatch, type Comment } from "../../api/comments-admin";

const router = useRouter();

// 状态
const comments = ref<Comment[]>([]);
const loading = ref(false);
const error = ref("");
const selectedIds = ref<Set<number>>(new Set());
const currentPage = ref(1);
const pageSize = ref(20);
const totalPages = ref(1);
const total = ref(0);

// 筛选条件
const filterDocUid = ref("");
const filterStatus = ref<"active" | "hidden" | "deleted" | "">("");
const filterKeyword = ref("");
const showFilterPanel = ref(false);

// 分页导航
const pageNumbers = computed(() => {
  const pages: number[] = [];
  const start = Math.max(1, currentPage.value - 2);
  const end = Math.min(totalPages.value, currentPage.value + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  return pages;
});

// 加载数据
async function loadComments() {
  loading.value = true;
  error.value = "";
  try {
    const result = await listAllComments({
      page: currentPage.value,
      pageSize: pageSize.value,
      docUid: filterDocUid.value || undefined,
      status: filterStatus.value || undefined,
      keyword: filterKeyword.value || undefined,
    });
    comments.value = result.comments;
    total.value = result.total;
    totalPages.value = result.totalPages;
    selectedIds.value.clear();
  } catch (e: any) {
    error.value = e.message || "加载评论失败";
  } finally {
    loading.value = false;
  }
}

// 搜索
function handleSearch() {
  currentPage.value = 1;
  void loadComments();
}

// 重置筛选
function resetFilters() {
  filterDocUid.value = "";
  filterStatus.value = "";
  filterKeyword.value = "";
  currentPage.value = 1;
  void loadComments();
}

// 全选/取消全选
function toggleSelectAll() {
  if (selectedIds.value.size === comments.value.length) {
    selectedIds.value.clear();
  } else {
    comments.value.forEach(c => selectedIds.value.add(c.id));
  }
}

// 切换单选
function toggleSelect(id: number) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
}

// 删除单个
async function handleDelete(comment: Comment) {
  if (!confirm(`确定删除此评论？\n\n"${comment.content.slice(0, 50)}..."`)) return;
  try {
    await deleteCommentAdmin(comment.id);
    void loadComments();
  } catch (e: any) {
    error.value = e.message || "删除失败";
  }
}

// 批量删除
async function handleBatchDelete() {
  const ids = Array.from(selectedIds.value);
  if (ids.length === 0) return;
  if (!confirm(`确定删除选中的 ${ids.length} 条评论？`)) return;
  try {
    await deleteCommentsBatch(ids);
    selectedIds.value.clear();
    void loadComments();
  } catch (e: any) {
    error.value = e.message || "批量删除失败";
  }
}

// 格式化时间
function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 跳转文档
function goToDoc(docUid: string) {
  router.push(`/admin/docs/${docUid}`);
}

// 状态标签
function getStatusTag(status: string) {
  switch (status) {
    case "active": return { label: "正常", class: "cd-tag--success" };
    case "hidden": return { label: "隐藏", class: "cd-tag--warning" };
    case "deleted": return { label: "已删", class: "cd-tag--danger" };
    default: return { label: status, class: "" };
  }
}

// 截断内容
function truncateContent(content: string, maxLength = 100) {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + "...";
}

onMounted(() => {
  void loadComments();
});
</script>

<template>
  <div class="comment-manage">
    <header class="comment-manage__header">
      <div class="comment-manage__title">
        <MessageSquare :size="20" />
        <h1>评论管理</h1>
        <span class="cd-tag">{{ total }} 条评论</span>
      </div>
    </header>

    <!-- 工具栏 -->
    <div class="comment-manage__toolbar">
      <div class="comment-manage__search">
        <div class="cd-input-group">
          <input
            v-model="filterKeyword"
            type="text"
            class="cd-input"
            placeholder="搜索评论内容..."
            @keydown.enter="handleSearch"
          />
          <button class="cd-button" type="button" @click="handleSearch">
            <Search :size="16" />
          </button>
        </div>
        <input
          v-model="filterDocUid"
          type="text"
          class="cd-input"
          placeholder="文档 UID..."
          @keydown.enter="handleSearch"
        />
        <select v-model="filterStatus" class="cd-select" @change="handleSearch">
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="hidden">隐藏</option>
          <option value="deleted">已删除</option>
        </select>
        <button
          class="cd-button"
          type="button"
          :class="{ primary: filterDocUid || filterStatus || filterKeyword }"
          @click="showFilterPanel = !showFilterPanel"
        >
          <Filter :size="16" />
        </button>
      </div>
      <div class="comment-manage__actions">
        <span v-if="selectedIds.size > 0" class="comment-manage__selected">
          已选 {{ selectedIds.size }} 条
        </span>
        <button
          v-if="selectedIds.size > 0"
          class="cd-button danger"
          type="button"
          @click="handleBatchDelete"
        >
          <Trash2 :size="16" />
          批量删除
        </button>
      </div>
    </div>

    <!-- 错误提示 -->
    <p v-if="error" class="cd-alert cd-alert--danger">{{ error }}</p>

    <!-- 加载状态 -->
    <div v-if="loading" class="comment-manage__loading">
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
    </div>

    <!-- 列表 -->
    <div v-else-if="comments.length" class="comment-manage__list">
      <table class="cd-table">
        <thead>
          <tr>
            <th class="col-check">
              <input
                type="checkbox"
                :checked="selectedIds.size === comments.length && comments.length > 0"
                @change="toggleSelectAll"
              />
            </th>
            <th>内容</th>
            <th>文档</th>
            <th>用户</th>
            <th>状态</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="comment in comments" :key="comment.id">
            <td class="col-check">
              <input
                type="checkbox"
                :checked="selectedIds.has(comment.id)"
                @change="toggleSelect(comment.id)"
              />
            </td>
            <td class="col-content">
              <div class="comment-content">
                <p class="comment-content__text">{{ truncateContent(comment.content) }}</p>
                <div v-if="comment.selectionText" class="comment-content__selection">
                  <EyeOff :size="12" />
                  "{{ truncateContent(comment.selectionText, 30) }}"
                </div>
              </div>
            </td>
            <td class="col-doc">
              <a href="#" class="cd-link" @click.prevent="goToDoc(comment.docUid)">
                {{ comment.docUid.slice(0, 8) }}...
              </a>
            </td>
            <td class="col-user">{{ comment.userName || "未知用户" }}</td>
            <td class="col-status">
              <span :class="['cd-tag', getStatusTag(comment.status).class]">
                {{ getStatusTag(comment.status).label }}
              </span>
            </td>
            <td class="col-time">{{ formatDate(comment.createdAt) }}</td>
            <td class="col-actions">
              <button
                class="cd-button danger ghost"
                type="button"
                title="删除"
                @click="handleDelete(comment)"
              >
                <Trash2 :size="14" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 空状态 -->
    <div v-else class="comment-manage__empty">
      <MessageSquare :size="48" />
      <p>暂无评论</p>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="comment-manage__pagination">
      <span class="comment-manage__pagination-info">
        第 {{ currentPage }} / {{ totalPages }} 页，共 {{ total }} 条
      </span>
      <div class="cd-pagination">
        <button
          class="cd-button ghost"
          type="button"
          :disabled="currentPage <= 1"
          @click="currentPage--; void loadComments()"
        >
          <ChevronLeft :size="16" />
        </button>
        <template v-for="page in pageNumbers" :key="page">
          <button
            class="cd-button"
            :class="{ primary: page === currentPage }"
            type="button"
            @click="currentPage = page; void loadComments()"
          >
            {{ page }}
          </button>
        </template>
        <button
          class="cd-button ghost"
          type="button"
          :disabled="currentPage >= totalPages"
          @click="currentPage++; void loadComments()"
        >
          <ChevronRight :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comment-manage {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.comment-manage__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.comment-manage__title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.comment-manage__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--cd-text);
}

.comment-manage__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 16px;
  background: var(--cd-panel);
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
}

.comment-manage__search {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.comment-manage__search .cd-input {
  width: 200px;
}

.comment-manage__search .cd-input:first-child {
  width: 280px;
}

.comment-manage__search .cd-select {
  width: 120px;
}

.comment-manage__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.comment-manage__selected {
  font-size: 13px;
  color: var(--cd-primary);
  font-weight: 600;
}

.comment-manage__loading {
  display: grid;
  gap: 12px;
  padding: 24px;
}

.comment-manage__loading span {
  height: 60px;
}

.comment-manage__list {
  background: var(--cd-panel);
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
  overflow: hidden;
}

.cd-table {
  width: 100%;
  border-collapse: collapse;
}

.cd-table th,
.cd-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--cd-border);
}

.cd-table th {
  background: var(--cd-paper);
  font-size: 12px;
  font-weight: 700;
  color: var(--cd-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.cd-table tbody tr:hover {
  background: var(--cd-paper-soft);
}

.cd-table tbody tr:last-child td {
  border-bottom: none;
}

.col-check {
  width: 40px;
  text-align: center;
}

.col-content {
  max-width: 400px;
}

.comment-content__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cd-text);
  word-break: break-word;
}

.comment-content__selection {
  margin-top: 4px;
  padding: 4px 8px;
  background: var(--cd-primary-soft);
  border-radius: 4px;
  font-size: 11px;
  color: var(--cd-primary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.col-doc {
  width: 120px;
}

.col-user {
  width: 100px;
  font-size: 13px;
}

.col-status {
  width: 80px;
}

.col-time {
  width: 160px;
  font-size: 12px;
  color: var(--cd-muted);
}

.col-actions {
  width: 60px;
  text-align: center;
}

.comment-manage__empty {
  display: grid;
  place-items: center;
  padding: 64px;
  background: var(--cd-panel);
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
  color: var(--cd-muted);
  text-align: center;
}

.comment-manage__empty svg {
  margin-bottom: 16px;
  opacity: 0.5;
}

.comment-manage__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
}

.comment-manage__pagination-info {
  font-size: 13px;
  color: var(--cd-muted);
}

.cd-pagination {
  display: flex;
  gap: 4px;
}
</style>
