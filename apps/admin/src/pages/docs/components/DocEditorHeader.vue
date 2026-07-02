<script setup lang="ts">
/**
 * DocEditorHeader.vue - 桌面端标题栏和工具栏
 *
 * 职责：
 * - 标题输入
 * - 同步状态指示器
 * - 字数统计
 * - 快捷操作按钮组
 * - 更多操作下拉菜单
 */
import { ref } from "vue";
import {
  PanelRightOpen, Copy, MessageSquare, Clock, RotateCcw,
  ExternalLink, MoreHorizontal, Download, Trash2
} from "lucide-vue-next";
import SyncIndicator from "../../../components/common/SyncIndicator.vue";
import type { DocDetail } from "../../../api/docs";
import type { DocSchedule } from "../../../api/docs";
import type { SyncState } from "../../../composables/useSyncState";

const props = defineProps<{
  current: DocDetail | null;
  title: string;
  saveState: "idle" | "pending" | "saving" | "saved" | "error";
  saveError: string;
  wordCount: number;
  shareUrl: string;
  shareCanOpenPublicly: boolean;
  shareEnabled: boolean;
  shareLoading: boolean;
  shareHasPassword: boolean;
  shareStatus: string;
  shareReviewText: string;
  sharePanelOpen: boolean;
  commentPanelOpen: boolean;
  scheduleData: DocSchedule | null;
  selectedVersion: { id: number; title: string; createdAt: string } | null;
  syncState: {
    syncState: { value: SyncState };
  };
}>();

const emit = defineEmits<{
  (e: "update:title", value: string): void;
  (e: "toggle-share-panel"): void;
  (e: "copy-share"): void;
  (e: "toggle-comment-panel"): void;
  (e: "open-schedule-panel"): void;
  (e: "open-desktop-delete"): void;
  (e: "open-export-menu"): void;
  (e: "retry-save"): void;
}>();

const moreMenuOpen = ref(false);
const detailsRef = ref<HTMLDetailsElement | null>(null);

function handleTitleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit("update:title", target.value);
}

function toggleMoreMenu() {
  moreMenuOpen.value = !moreMenuOpen.value;
}

function closeMoreMenu() {
  moreMenuOpen.value = false;
}

const saveText = {
  idle: "",
  pending: "待保存",
  saving: "保存中...",
  saved: "已保存",
  error: "保存失败"
};
</script>

<template>
  <header class="doc-editor-header">
    <input
      :value="title"
      class="doc-editor-header__title"
      aria-label="文档标题"
      @input="handleTitleInput"
    />

    <SyncIndicator :state="syncState.syncState.value" />

    <span
      v-if="saveText[saveState]"
      class="doc-editor-header__save"
      :class="`is-${saveState}`"
    >
      {{ saveText[saveState] }}
    </span>

    <span class="doc-editor-header__metrics">{{ wordCount }} 字</span>

    <button
      class="cd-button"
      :class="{ primary: sharePanelOpen }"
      type="button"
      @click="emit('toggle-share-panel')"
    >
      <PanelRightOpen :size="16" />
      分享
    </button>

    <button
      class="cd-button"
      type="button"
      :disabled="shareLoading"
      @click="emit('copy-share')"
    >
      <Copy :size="16" />
      复制链接
    </button>

    <button
      class="cd-button"
      :class="{ primary: commentPanelOpen }"
      type="button"
      @click="emit('toggle-comment-panel')"
    >
      <MessageSquare :size="16" />
      评论
    </button>

    <button
      class="cd-button"
      :class="{ primary: scheduleData?.scheduledAt || scheduleData?.expiresAt }"
      type="button"
      @click="emit('open-schedule-panel')"
    >
      <Clock :size="16" />
      定时
    </button>

    <button
      class="cd-button"
      :class="{ primary: selectedVersion }"
      type="button"
      @click="emit('toggle-share-panel')"
      title="查看版本历史"
    >
      <RotateCcw :size="16" />
      历史
    </button>

    <a
      v-if="shareCanOpenPublicly"
      class="cd-button"
      :href="shareUrl"
      target="_blank"
      rel="noopener noreferrer"
    >
      <ExternalLink :size="16" />
      打开
    </a>

    <details class="doc-editor-header__more" @blur="closeMoreMenu">
      <summary
        ref="detailsRef"
        class="cd-button"
        role="button"
        aria-label="更多操作"
        title="更多操作"
        @click="toggleMoreMenu"
      >
        <MoreHorizontal :size="17" />
        更多
      </summary>
      <div
        v-show="moreMenuOpen"
        class="doc-editor-header__menu"
        @click.stop="moreMenuOpen = false"
      >
        <button type="button" @click="emit('open-export-menu')">
          <Download :size="16" />
          导出文档
        </button>
        <button type="button" @click="emit('open-desktop-delete')">
          <Trash2 :size="16" />
          删除文档
        </button>
      </div>
    </details>
  </header>
</template>

<style scoped>
.doc-editor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--cd-border-color, #e5e7eb);
  background: var(--cd-bg, #fff);
  flex-wrap: wrap;
}

.doc-editor-header__title {
  flex: 1;
  min-width: 200px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 600;
  background: transparent;
  transition: border-color 0.15s;
}

.doc-editor-header__title:hover {
  border-color: var(--cd-border-color, #e5e7eb);
}

.doc-editor-header__title:focus {
  outline: none;
  border-color: var(--cd-primary, #3b82f6);
}

.doc-editor-header__metrics {
  font-size: 13px;
  color: var(--cd-text-secondary, #6b7280);
  white-space: nowrap;
}

.doc-editor-header__save {
  font-size: 13px;
  color: var(--cd-error, #ef4444);
  white-space: nowrap;
}

.doc-editor-header__save.is-saving {
  color: var(--cd-primary, #3b82f6);
}

.doc-editor-header__more {
  position: relative;
}

.doc-editor-header__more summary {
  list-style: none;
}

.doc-editor-header__more summary::-webkit-details-marker {
  display: none;
}

.doc-editor-header__menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  padding: 4px;
  background: var(--cd-bg, #fff);
  border: 1px solid var(--cd-border-color, #e5e7eb);
  border-radius: 6px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  z-index: 50;
  min-width: 140px;
}

.doc-editor-header__menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  font-size: 14px;
  color: var(--cd-text, #374151);
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
}

.doc-editor-header__menu button:hover {
  background: var(--cd-bg-secondary, #f3f4f6);
}

.doc-editor-header__menu button:last-child {
  color: var(--cd-error, #ef4444);
}

/* 响应式：小于 1180px 隐藏性能指标 */
@media (max-width: 1180px) {
  .doc-editor-header__metrics {
    display: none;
  }
}

/* 响应式：小于 980px 隐藏保存状态 */
@media (max-width: 980px) {
  .doc-editor-header__save {
    display: none;
  }
}
</style>
