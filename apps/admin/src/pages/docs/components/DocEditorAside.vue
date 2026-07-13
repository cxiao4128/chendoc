<script setup lang="ts">
/**
 * DocEditorAside.vue - 桌面端侧边栏容器
 *
 * 职责：
 * - 桌面端侧边栏容器
 * - 面板切换逻辑
 * - 布局控制
 */
import { computed } from "vue";
import type { DocVersion } from "@/services/api";
import type { DocSchedule } from "@/services/api";

const props = defineProps<{
  sharePanelOpen: boolean;
  commentPanelOpen: boolean;
  schedulePanelOpen: boolean;
  share: { isEnabled?: boolean; shareCode?: string; customSlug?: string; hasPassword?: boolean; reviewStatus?: string } | null;
  shareUrl: string;
  shareLoading: boolean;
  shareEnabled: boolean;
  sharePassword: string;
  shareHasPassword: boolean;
  shareStatus: string;
  shareCodeInput: string;
  customSlugInput: string;
  shareReviewText: string;
  shareAccessText: string;
  shareExpiryText: string;
  shareMessage: string;
  shareStatusIsError: boolean;
  versions: DocVersion[];
  selectedVersion: DocVersion | null;
  versionPreview: { contentText?: string } | null;
  versionPreviewLoading: boolean;
  scheduleData: DocSchedule | null;
  scheduleLoading: boolean;
  scheduleError: string;
  isAdmin: boolean;
  auth: { isAdmin: boolean };
}>();

const emit = defineEmits<{
  (e: "update:sharePanelOpen", value: boolean): void;
  (e: "update:commentPanelOpen", value: boolean): void;
  (e: "update:schedulePanelOpen", value: boolean): void;
  (e: "open-version-preview", version: DocVersion): void;
  (e: "restore-version", version: DocVersion): void;
  (e: "restore-version-as-copy", version: DocVersion): void;
  (e: "save-schedule", input: { scheduledAt?: string | null; expiresAt?: string | null; autoArchive?: boolean }): void;
  (e: "clear-schedule"): void;
  // 分享相关
  (e: "update:shareEnabled", value: boolean): void;
  (e: "update:sharePassword", value: string): void;
  (e: "update:customSlugInput", value: string): void;
  (e: "confirm-password"): void;
  (e: "clear-password"): void;
  (e: "password-input"): void;
  (e: "copy-share"): void;
  (e: "resubmit-share"): void;
}>();

// 共享 props
const _shareEnabled = computed({
  get: () => props.shareEnabled,
  set: (v) => emit("update:shareEnabled", v)
});

const _sharePasswordComputed = computed({
  get: () => props.sharePassword,
  set: (v) => emit("update:sharePassword", v)
});

const _customSlugInput = computed({
  get: () => props.customSlugInput,
  set: (v) => emit("update:customSlugInput", v)
});

const commentPanelOpen = computed({
  get: () => props.commentPanelOpen,
  set: (v) => emit("update:commentPanelOpen", v)
});

const schedulePanelOpen = computed({
  get: () => props.schedulePanelOpen,
  set: (v) => emit("update:schedulePanelOpen", v)
});
</script>

<template>
  <aside class="doc-editor-aside">
    <!-- 分享面板 -->
    <section v-if="sharePanelOpen">
      <h2>分享</h2>
      <slot name="share-panel" />
    </section>

    <!-- 评论面板 -->
    <section v-if="commentPanelOpen">
      <slot name="comment-panel" />
    </section>

    <!-- 定时发布面板 -->
    <section v-if="schedulePanelOpen">
      <slot name="schedule-panel" />
    </section>

    <!-- 版本历史面板 -->
    <section>
      <slot name="version-panel" />
    </section>
  </aside>
</template>

<style scoped>
.doc-editor-aside {
  width: 320px;
  min-width: 320px;
  height: 100%;
  overflow-y: auto;
  border-left: 1px solid var(--cd-border-color, #e5e7eb);
  background: var(--cd-bg, #fff);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.doc-editor-aside section {
  flex-shrink: 0;
}
</style>
