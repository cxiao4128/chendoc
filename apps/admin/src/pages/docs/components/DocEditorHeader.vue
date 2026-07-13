<script setup lang="ts">
import { ref } from "vue";
import {
  Clock, Copy, Download, ExternalLink, MessageSquare,
  MoreHorizontal, PanelRightOpen, RotateCcw, Trash2
} from "lucide-vue-next";
import SyncIndicator from "../../../components/common/SyncIndicator.vue";
import type { DocDetail, DocSchedule } from "@/services/api";
import type { SyncState } from "../../../composables/useSyncState";
import "./doc-editor-header.css";

defineProps<{
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
  syncState: { syncState: { value: SyncState } };
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
const saveText = {
  idle: "",
  pending: "待保存",
  saving: "保存中...",
  saved: "已保存",
  error: "保存失败"
};

function handleTitleInput(event: Event) {
  emit("update:title", (event.target as HTMLInputElement).value);
}

function toggleMoreMenu() {
  moreMenuOpen.value = !moreMenuOpen.value;
}

function closeMoreMenu() {
  moreMenuOpen.value = false;
}
</script>

<template>
  <header class="doc-editor-header">
    <input :value="title" class="doc-editor-header__title" aria-label="文档标题" @input="handleTitleInput" />
    <SyncIndicator :state="syncState.syncState.value" />
    <span v-if="saveText[saveState]" class="doc-editor-header__save" :class="`is-${saveState}`">
      {{ saveText[saveState] }}
    </span>
    <span class="doc-editor-header__metrics">{{ wordCount }} 字</span>

    <button class="cd-button" :class="{ primary: sharePanelOpen }" type="button" @click="emit('toggle-share-panel')">
      <PanelRightOpen :size="16" />分享
    </button>
    <button class="cd-button" type="button" :disabled="shareLoading" @click="emit('copy-share')">
      <Copy :size="16" />复制链接
    </button>
    <button class="cd-button" :class="{ primary: commentPanelOpen }" type="button" @click="emit('toggle-comment-panel')">
      <MessageSquare :size="16" />评论
    </button>
    <button class="cd-button" :class="{ primary: scheduleData?.scheduledAt || scheduleData?.expiresAt }" type="button" @click="emit('open-schedule-panel')">
      <Clock :size="16" />定时
    </button>
    <button class="cd-button" :class="{ primary: selectedVersion }" type="button" @click="emit('toggle-share-panel')" title="查看版本历史">
      <RotateCcw :size="16" />历史
    </button>
    <a v-if="shareCanOpenPublicly" class="cd-button" :href="shareUrl" target="_blank" rel="noopener noreferrer">
      <ExternalLink :size="16" />打开
    </a>

    <details class="doc-editor-header__more" @blur="closeMoreMenu">
      <summary ref="detailsRef" class="cd-button" role="button" aria-label="更多操作" title="更多操作" @click="toggleMoreMenu">
        <MoreHorizontal :size="17" />更多
      </summary>
      <div v-show="moreMenuOpen" class="doc-editor-header__menu" @click.stop="moreMenuOpen = false">
        <button type="button" @click="emit('open-export-menu')"><Download :size="16" />导出文档</button>
        <button type="button" @click="emit('open-desktop-delete')"><Trash2 :size="16" />删除文档</button>
      </div>
    </details>
  </header>
</template>
