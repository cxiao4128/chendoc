<script setup lang="ts">
import { computed } from "vue";
import { Clock, FileText, Star } from "lucide-vue-next";
import "./kanban-board.css";

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

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
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
    const groups: Record<string, DocItem[]> = { published: [], draft: [] };
    for (const doc of props.docs) groups[doc.status === "published" ? "published" : "draft"].push(doc);
    return [
      { id: "published", title: "已发布", docs: groups.published },
      { id: "draft", title: "草稿", docs: groups.draft },
    ];
  }
  if (props.groupBy === "tag") {
    const groups: Record<string, DocItem[]> = {};
    for (const doc of props.docs) {
      const key = docTags(doc)[0] || "未分类";
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
    <div v-for="lane in lanes" :key="lane.id" class="kanban-lane">
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
            <span class="kanban-card__date"><Clock :size="11" />{{ formatDate(doc.updatedAt) }}</span>
            <span v-if="doc.shareCode && doc.shareEnabled" class="kanban-card__share">已分享</span>
          </div>
        </article>
        <div v-if="lane.docs.length === 0" class="kanban-lane__empty">暂无文档</div>
      </div>
    </div>
  </div>
</template>
