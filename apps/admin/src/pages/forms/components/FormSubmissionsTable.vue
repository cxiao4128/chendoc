<script setup lang="ts">
import { Eye, Trash2 } from "lucide-vue-next";
import { formatFieldValue, formatFormDate, type FormField, type SubmissionItem } from "../../../features/forms";

defineProps<{
  submissions: SubmissionItem[];
  inputFields: FormField[];
  pagination: { page: number; pageSize: number; hasMore: boolean };
  loadingMore: boolean;
}>();

defineEmits<{
  viewDetail: [submission: SubmissionItem];
  deleteSubmission: [submission: SubmissionItem];
  loadMore: [];
}>();
</script>

<template>
  <div class="tab-content">
    <div v-if="submissions.length === 0" class="empty-state">
      还没有人提交
    </div>

    <div v-else class="submissions-table">
      <div class="submissions-mobile-list">
        <article v-for="submission in submissions" :key="submission.id" @click="$emit('viewDetail', submission)">
          <header><strong>提交 #{{ submission.id }}</strong><time>{{ formatFormDate(submission.submittedAt) }}</time></header>
          <dl>
            <div v-for="field in inputFields.slice(0, 3)" :key="field.id">
              <dt>{{ field.label }}</dt>
              <dd>{{ formatFieldValue(submission.data[field.id]) }}</dd>
            </div>
          </dl>
          <footer>
            <button class="cd-button" type="button" @click.stop="$emit('viewDetail', submission)"><Eye :size="14" />查看详情</button>
            <button class="cd-button danger" type="button" @click.stop="$emit('deleteSubmission', submission)"><Trash2 :size="14" />删除</button>
          </footer>
        </article>
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th v-for="field in inputFields" :key="field.id">{{ field.label }}</th>
            <th>来源摘要</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(submission, index) in submissions" :key="submission.id">
            <td>{{ index + 1 }}</td>
            <td v-for="field in inputFields" :key="field.id">
              {{ formatFieldValue(submission.data[field.id]) }}
            </td>
            <td class="ip-cell">{{ submission.ip }}</td>
            <td>{{ formatFormDate(submission.submittedAt) }}</td>
            <td class="action-cell">
              <button class="action-btn" title="查看详情" @click="$emit('viewDetail', submission)">
                <Eye :size="14" />
              </button>
              <button class="action-btn danger" title="删除" @click="$emit('deleteSubmission', submission)">
                <Trash2 :size="14" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="pagination.hasMore" class="load-more">
        <button class="cd-button" :disabled="loadingMore" @click="$emit('loadMore')">{{ loadingMore ? "加载中..." : "加载更多" }}</button>
      </div>
    </div>
  </div>
</template>
