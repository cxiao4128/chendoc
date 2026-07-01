<script setup lang="ts">
// ChenDoc v3.0.0 - 看板视图组件
import { computed } from "vue";
import { FileText, Star, MoreHorizontal, Clock } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useWorkspaceRoutes } from "../../composables/useWorkspaceRoutes";

interface DocItem {
  docUid: string;
  title: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  shareCode?: number | string | null;
  shareEnabled?: boolean | null;
  pinned?: boolean;
  tags?: string[] | string | null;
}

const props = defineProps<{
  docs: DocItem[];
  groupBy: "status" | "tag" | "space";
  onDocClick: (docUid: string) => void;
  onDocStar: (doc: DocItem) => void;
}>();

const router = useRouter();
const { docPath } = useWorkspaceRoutes();

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function docTags(doc: DocItem) {
  if (Array.isArray(doc.tags)) return doc.tags;
  if (typeof doc.tags !== "string") return [];
  try { return JSON.parse(doc.tags) as string[]; } catch { return []; }
}

const lanes = computed(() => {
  if (props.groupBy === "status") {
    const groups: Record<string, DocItem[]> = {
      "published": [],
      "draft": [],
    };
    for (const doc of props.docs) {
      const key = doc.status === "published" ? "published" : "draft";
      groups[key].push(doc);
    }
    return [
      { id: "published", title: "已发布", docs: groups["published"] },
      { id: "draft", title: "草稿", docs: groups["draft"] },
    ];
  }

  if (props.groupBy === "tag") {
    const groups: Record<string, DocItem[]> = {};
    for (const doc of props.docs) {
      const tags = docTags(doc);
      const key = tags[0] || "未分类";
      if (!groups[key]) groups[key] = [];
      groups[key].push(doc);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
      .map(([id, docs]) => ({ id, title: id, docs }));
  }

  return [{ id: "all", title: "全部文档", docs: props.docs }];
});

function openDoc(doc: DocItem) {
  props.onDocClick(doc.docUid);
}

function toggleStar(e: Event, doc: DocItem) {
  e.stopPropagation();
  props.onDocStar(doc);
}
</script>

<template>
  <div class="kanban-board">
    <div
      v-for="lane in lanes"
      :key="lane.id"
      class="kanban-lane"
    >
      <header class="kanban-lane__header">
        <h3>{{ lane.title }}</h3>
        <span class="kanban-lane__count">{{ lane.docs.length }}</span>
      </header>
      <div class="kanban-lane__cards">
        <article
          v-for="doc in lane.docs"
          :key="doc.docUid"
          class="kanban-card"
          tabindex="0"
          role="button"
          @click="openDoc(doc)"
          @keydown.enter="openDoc(doc)"
        >
          <div class="kanban-card__header">
            <i><FileText :size="14" /></i>
            <span class="kanban-card__title">{{ doc.title }}</span>
            <button
              type="button"
              class="kanban-card__star"
              :class="{ 'is-active': doc.pinned }"
              :aria-label="doc.pinned ? '取消收藏' : '收藏'"
              @click="toggleStar($event, doc)"
            >
              <Star :size="14" />
            </button>
          </div>
          <div class="kanban-card__meta">
            <span class="kanban-card__date">
              <Clock :size="11" />
              {{ formatDate(doc.updatedAt) }}
            </span>
            <span v-if="doc.shareCode && doc.shareEnabled" class="kanban-card__share">已分享</span>
          </div>
        </article>
        <div v-if="lane.docs.length === 0" class="kanban-lane__empty">
          暂无文档
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban-board {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--cd-scrollbar-thumb) var(--cd-scrollbar-track);
}

.kanban-board::-webkit-scrollbar {
  height: 6px;
}

.kanban-board::-webkit-scrollbar-track {
  background: var(--cd-scrollbar-track);
  border-radius: 3px;
}

.kanban-board::-webkit-scrollbar-thumb {
  background: var(--cd-scrollbar-thumb);
  border-radius: 3px;
}

.kanban-lane {
  flex: 0 0 280px;
  display: grid;
  gap: 10px;
  max-height: calc(100vh - 280px);
}

.kanban-lane__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  position: sticky;
  top: 0;
  background: var(--cd-bg);
  z-index: 1;
}

.kanban-lane__header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-text);
}

.kanban-lane__count {
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--cd-paper-soft);
  color: var(--cd-muted);
  font-size: 11px;
  font-weight: 600;
  padding: 0 6px;
}

.kanban-lane__cards {
  display: grid;
  gap: 8px;
  align-content: start;
  overflow-y: auto;
  max-height: calc(100vh - 320px);
  padding: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--cd-scrollbar-thumb) var(--cd-scrollbar-track);
}

.kanban-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
  background: var(--cd-panel);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.kanban-card:hover {
  border-color: var(--cd-border-strong);
  box-shadow: var(--cd-shadow-card);
  transform: translateY(-1px);
}

.kanban-card:focus {
  outline: none;
  border-color: var(--cd-primary);
  box-shadow: 0 0 0 3px var(--cd-focus);
}

.kanban-card__header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.kanban-card__header > i {
  flex-shrink: 0;
  color: var(--cd-muted);
  margin-top: 2px;
}

.kanban-card__title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-text);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.kanban-card__star {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--cd-muted);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.kanban-card__star:hover {
  background: var(--cd-primary-soft);
  color: var(--cd-primary);
}

.kanban-card__star.is-active {
  color: #f59e0b;
}

.kanban-card__meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kanban-card__date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--cd-muted);
}

.kanban-card__share {
  font-size: 10px;
  font-weight: 600;
  color: var(--cd-success);
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--cd-success-soft);
}

.kanban-lane__empty {
  padding: 24px;
  text-align: center;
  color: var(--cd-muted);
  font-size: 13px;
}

@media (max-width: 768px) {
  .kanban-board {
    gap: 12px;
  }

  .kanban-lane {
    flex: 0 0 260px;
  }
}
</style>