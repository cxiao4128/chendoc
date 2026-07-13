<script setup lang="ts">
import { EyeOff, MessageSquare, Trash2 } from "lucide-vue-next";
import {
  commentStatusTag,
  formatCommentDate,
  truncateCommentContent,
  type Comment
} from "../../../features/comments";

defineProps<{
  comments: Comment[];
  selectedIds: Set<number>;
  loading: boolean;
}>();

defineEmits<{
  toggleSelectAll: [];
  toggleSelect: [id: number];
  goToDoc: [docUid: string];
  deleteComment: [comment: Comment];
}>();
</script>

<template>
  <div v-if="loading" class="comment-manage__loading">
    <span class="cd-skeleton" />
    <span class="cd-skeleton" />
    <span class="cd-skeleton" />
  </div>

  <div v-else-if="comments.length" class="comment-manage__list">
    <table class="cd-table">
      <thead>
        <tr>
          <th class="col-check">
            <input
              type="checkbox"
              :checked="selectedIds.size === comments.length && comments.length > 0"
              @change="$emit('toggleSelectAll')"
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
              @change="$emit('toggleSelect', comment.id)"
            />
          </td>
          <td class="col-content">
            <div class="comment-content">
              <p class="comment-content__text">{{ truncateCommentContent(comment.content) }}</p>
              <div v-if="comment.selectionText" class="comment-content__selection">
                <EyeOff :size="12" />
                "{{ truncateCommentContent(comment.selectionText, 30) }}"
              </div>
            </div>
          </td>
          <td class="col-doc">
            <a href="#" class="cd-link" @click.prevent="$emit('goToDoc', comment.docUid)">
              {{ comment.docUid.slice(0, 8) }}...
            </a>
          </td>
          <td class="col-user">{{ comment.userName || "未知用户" }}</td>
          <td class="col-status">
            <span :class="['cd-tag', commentStatusTag(comment.status).class]">
              {{ commentStatusTag(comment.status).label }}
            </span>
          </td>
          <td class="col-time">{{ formatCommentDate(comment.createdAt) }}</td>
          <td class="col-actions">
            <button
              class="cd-button danger ghost"
              type="button"
              title="删除"
              @click="$emit('deleteComment', comment)"
            >
              <Trash2 :size="14" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div v-else class="comment-manage__empty">
    <MessageSquare :size="48" />
    <p>暂无评论</p>
  </div>
</template>
