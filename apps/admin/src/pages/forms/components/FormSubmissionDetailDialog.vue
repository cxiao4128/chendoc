<script setup lang="ts">
import { formatFieldValue, formatFormDate, type FormField, type SubmissionItem } from "../../../features/forms";

const open = defineModel<boolean>({ required: true });

defineProps<{
  selectedSubmission: SubmissionItem | null;
  inputFields: FormField[];
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="detail-dialog-overlay" @click="open = false">
      <div class="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="submission-detail-title" @click.stop>
        <div class="detail-dialog__header">
          <h3 id="submission-detail-title">提交详情</h3>
          <button class="detail-dialog__close" type="button" aria-label="关闭提交详情" @click="open = false">&times;</button>
        </div>
        <div class="detail-dialog__body">
          <div class="detail-dialog__meta">
            <span>提交时间: {{ selectedSubmission ? formatFormDate(selectedSubmission.submittedAt) : "" }}</span>
            <span>来源摘要: {{ selectedSubmission?.ip }}</span>
            <span>User Agent: {{ selectedSubmission?.userAgent || "未记录" }}</span>
          </div>
          <div class="detail-dialog__content">
            <div v-for="field in inputFields" :key="field.id" class="detail-dialog__item">
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
</template>
