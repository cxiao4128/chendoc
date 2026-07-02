<script setup lang="ts">
/**
 * DocSchedulePanel.vue - 定时发布面板
 *
 * 职责：
 * - 定时发布时间选择
 * - 草稿过期时间选择
 * - 自动归档开关
 * - 加载/保存状态
 */
import type { DocSchedule } from "../../../api/docs";

const props = defineProps<{
  scheduleData: DocSchedule | null;
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  (e: "save", input: { scheduledAt?: string | null; expiresAt?: string | null; autoArchive?: boolean }): void;
  (e: "clear"): void;
}>();

function formatScheduleDate(isoString: string | null) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function handleScheduledAtChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = target.value ? new Date(target.value).toISOString() : null;
  emit("save", { scheduledAt: value });
}

function handleExpiresAtChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = target.value ? new Date(target.value).toISOString() : null;
  emit("save", { expiresAt: value });
}

function handleAutoArchiveChange(event: Event) {
  const target = event.target as HTMLInputElement;
  emit("save", { autoArchive: target.checked });
}
</script>

<template>
  <section class="doc-schedule-panel">
    <h2>
      <span>定时发布</span>
    </h2>

    <div v-if="loading" class="doc-schedule-panel__loading">
      <span class="cd-skeleton" />
    </div>

    <p v-else-if="error" class="doc-schedule-panel__error">
      {{ error }}
    </p>

    <div v-else class="doc-schedule-panel__form">
      <label class="doc-schedule-panel__field">
        <span>定时发布</span>
        <input
          type="datetime-local"
          class="cd-input"
          :value="scheduleData?.scheduledAt ? scheduleData.scheduledAt.slice(0, 16) : ''"
          @change="handleScheduledAtChange"
        />
        <small v-if="scheduleData?.scheduledAt">
          将于 {{ formatScheduleDate(scheduleData.scheduledAt) }} 自动发布
        </small>
      </label>

      <label class="doc-schedule-panel__field">
        <span>草稿过期</span>
        <input
          type="datetime-local"
          class="cd-input"
          :value="scheduleData?.expiresAt ? scheduleData.expiresAt.slice(0, 16) : ''"
          @change="handleExpiresAtChange"
        />
        <small v-if="scheduleData?.expiresAt">
          将于 {{ formatScheduleDate(scheduleData.expiresAt) }} 自动处理
        </small>
      </label>

      <label class="doc-schedule-panel__field">
        <span>过期后归档</span>
        <input
          type="checkbox"
          class="cd-checkbox"
          :checked="scheduleData?.autoArchive"
          @change="handleAutoArchiveChange"
        />
        <small>过期时将草稿标记为已归档</small>
      </label>

      <div v-if="scheduleData?.scheduledAt || scheduleData?.expiresAt" class="doc-schedule-panel__actions">
        <button
          class="cd-button danger"
          type="button"
          :disabled="loading"
          @click="emit('clear')"
        >
          清除定时
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.doc-schedule-panel {
  padding: 0;
}

.doc-schedule-panel h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--cd-text, #374151);
  margin: 0 0 12px 0;
  padding: 0 0 8px 0;
  border-bottom: 1px solid var(--cd-border-color, #e5e7eb);
}

.doc-schedule-panel__loading {
  padding: 20px 0;
}

.doc-schedule-panel__error {
  font-size: 13px;
  color: var(--cd-error, #ef4444);
  padding: 12px;
  background: rgba(239, 68, 68, 0.05);
  border-radius: 6px;
  margin: 0;
}

.doc-schedule-panel__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.doc-schedule-panel__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-schedule-panel__field > span {
  font-size: 13px;
  font-weight: 500;
  color: var(--cd-text, #374151);
}

.doc-schedule-panel__field .cd-input {
  padding: 8px 12px;
  border: 1px solid var(--cd-border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 14px;
}

.doc-schedule-panel__field .cd-input:focus {
  outline: none;
  border-color: var(--cd-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.doc-schedule-panel__field small {
  font-size: 12px;
  color: var(--cd-text-secondary, #6b7280);
}

.doc-schedule-panel__field .cd-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--cd-primary, #3b82f6);
}

.doc-schedule-panel__actions {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--cd-border-color, #e5e7eb);
}
</style>
