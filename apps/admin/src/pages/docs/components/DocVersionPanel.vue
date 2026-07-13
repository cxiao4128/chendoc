<script setup lang="ts">
/**
 * DocVersionPanel.vue - 版本历史面板
 *
 * 职责：
 * - 版本列表展示
 * - 版本预览弹窗
 * - 恢复版本操作
 * - 复制为新文档
 */
import { Eye } from "lucide-vue-next";
import type { DocVersion, DocVersionPreview } from "@/services/api";

const _props = defineProps<{
  versions: DocVersion[];
  selectedVersion: DocVersion | null;
  versionPreview: DocVersionPreview | null;
  versionPreviewLoading: boolean;
}>();

const emit = defineEmits<{
  (e: "open-version-preview", version: DocVersion): void;
  (e: "restore-version", version: DocVersion): void;
  (e: "restore-version-as-copy", version: DocVersion): void;
  (e: "close-preview"): void;
}>();

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
</script>

<template>
  <section class="doc-version-panel">
    <h2>历史版本</h2>

    <div v-if="versions.length" class="doc-version-panel__list">
      <button
        v-for="version in versions"
        :key="version.id"
        type="button"
        class="doc-version-panel__item"
        :class="{ 'is-selected': selectedVersion?.id === version.id }"
        @click="emit('open-version-preview', version)"
      >
        <Eye :size="14" />
        <span class="doc-version-panel__item-title">{{ version.title }}</span>
        <small class="doc-version-panel__item-meta">
          {{ version.wordCount }} 字 · {{ version.authorName }} · {{ formatDate(version.createdAt) }}
        </small>
        <small v-if="version.diffSummary" class="doc-version-panel__item-diff">
          {{ version.diffSummary }}
        </small>
      </button>
    </div>

    <p v-else class="doc-version-panel__empty">暂无版本</p>

    <!-- 版本预览弹窗 -->
    <div v-if="selectedVersion" class="doc-version-panel__preview">
      <strong>{{ selectedVersion.title }}</strong>

      <p v-if="versionPreviewLoading" class="doc-version-panel__preview-loading">
        正在加载预览…
      </p>

      <pre v-else class="doc-version-panel__preview-content">
        {{ versionPreview?.contentText || "此版本没有可预览文字。" }}
      </pre>

      <div class="doc-version-panel__preview-actions">
        <button
          class="cd-button"
          type="button"
          :disabled="versionPreviewLoading"
          @click="emit('restore-version-as-copy', selectedVersion)"
        >
          恢复为副本
        </button>
        <button
          class="cd-button primary"
          type="button"
          :disabled="versionPreviewLoading"
          @click="emit('restore-version', selectedVersion)"
        >
          恢复此版本
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.doc-version-panel {
  padding: 0;
}

.doc-version-panel h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--cd-text, #374151);
  margin: 0 0 12px 0;
  padding: 0 0 8px 0;
  border-bottom: 1px solid var(--cd-border-color, #e5e7eb);
}

.doc-version-panel__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.doc-version-panel__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--cd-border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--cd-bg, #fff);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.doc-version-panel__item:hover {
  border-color: var(--cd-primary, #3b82f6);
  background: var(--cd-bg-secondary, #f9fafb);
}

.doc-version-panel__item.is-selected {
  border-color: var(--cd-primary, #3b82f6);
  background: rgba(59, 130, 246, 0.05);
}

.doc-version-panel__item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--cd-text, #374151);
}

.doc-version-panel__item-meta {
  font-size: 12px;
  color: var(--cd-text-secondary, #6b7280);
}

.doc-version-panel__item-diff {
  font-size: 11px;
  color: var(--cd-text-tertiary, #9ca3af);
}

.doc-version-panel__empty {
  font-size: 13px;
  color: var(--cd-text-secondary, #6b7280);
  text-align: center;
  padding: 20px 0;
}

.doc-version-panel__preview {
  margin-top: 16px;
  padding: 16px;
  background: var(--cd-bg-secondary, #f9fafb);
  border-radius: 8px;
}

.doc-version-panel__preview strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--cd-text, #374151);
  margin-bottom: 8px;
}

.doc-version-panel__preview-loading {
  font-size: 13px;
  color: var(--cd-text-secondary, #6b7280);
  padding: 10px 0;
}

.doc-version-panel__preview-content {
  max-height: 200px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cd-text, #374151);
  background: var(--cd-bg, #fff);
  padding: 12px;
  border-radius: 4px;
  border: 1px solid var(--cd-border-color, #e5e7eb);
  white-space: pre-wrap;
  word-break: break-word;
}

.doc-version-panel__preview-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.doc-version-panel__preview-actions .cd-button {
  flex: 1;
}
</style>
