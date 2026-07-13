<script setup lang="ts">
import { MessageSquare, Reply, Send, ThumbsDown, ThumbsUp, Trash2 } from "lucide-vue-next";
import { useDocComments } from "../../features/comments";
import "./comment-panel.css";

const props = defineProps<{
  docUid: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const {
  canComment,
  loading,
  newComment,
  replyingTo,
  replyContent,
  submitting,
  error,
  rootComments,
  getReplies,
  submitComment,
  submitReply,
  handleDelete,
  handleReaction,
  formatCommentRelativeDate
} = useDocComments(() => props.docUid);
</script>

<template>
  <div class="comment-panel">
    <header class="comment-panel__header">
      <MessageSquare :size="18" />
      <span>评论</span>
      <span class="comment-panel__count">{{ rootComments.length }}</span>
      <button class="comment-panel__close" type="button" aria-label="关闭" @click="emit('close')">
        <span>×</span>
      </button>
    </header>

    <div class="comment-panel__body">
      <div v-if="loading" class="comment-panel__loading">
        <span class="cd-skeleton" />
        <span class="cd-skeleton" />
      </div>

      <p v-if="error" class="comment-panel__error">{{ error }}</p>

      <div v-else-if="rootComments.length" class="comment-panel__list">
        <article v-for="comment in rootComments" :key="comment.id" class="comment">
          <header class="comment__header">
            <span class="comment__author">{{ comment.userName }}</span>
            <span class="comment__time">{{ formatCommentRelativeDate(comment.createdAt) }}</span>
          </header>

          <div v-if="comment.selectionText" class="comment__selection">
            "{{ comment.selectionText }}"
          </div>

          <p class="comment__content">{{ comment.content }}</p>

          <footer class="comment__actions">
            <button
              class="comment__action"
              :class="{ active: comment.reactions?.some((reaction) => reaction.reaction === 'like' && reaction.userReacted) }"
              type="button"
              @click="handleReaction(comment, 'like')"
            >
              <ThumbsUp :size="14" />
              <span>{{ comment.reactions?.find((reaction) => reaction.reaction === 'like')?.count || 0 }}</span>
            </button>
            <button
              class="comment__action"
              :class="{ active: comment.reactions?.some((reaction) => reaction.reaction === 'dislike' && reaction.userReacted) }"
              type="button"
              @click="handleReaction(comment, 'dislike')"
            >
              <ThumbsDown :size="14" />
              <span>{{ comment.reactions?.find((reaction) => reaction.reaction === 'dislike')?.count || 0 }}</span>
            </button>
            <button v-if="canComment" class="comment__action" type="button" @click="replyingTo = comment.id">
              <Reply :size="14" />
              <span>回复</span>
            </button>
            <button v-if="canComment" class="comment__action comment__action--danger" type="button" @click="handleDelete(comment)">
              <Trash2 :size="14" />
            </button>
          </footer>

          <div v-if="getReplies(comment.id).length || replyingTo === comment.id" class="comment__replies">
            <article v-for="reply in getReplies(comment.id)" :key="reply.id" class="reply">
              <header class="comment__header">
                <span class="comment__author">{{ reply.userName }}</span>
                <span class="comment__time">{{ formatCommentRelativeDate(reply.createdAt) }}</span>
              </header>
              <p class="comment__content">{{ reply.content }}</p>
            </article>

            <div v-if="replyingTo === comment.id" class="comment__reply-form">
              <textarea
                v-model="replyContent"
                class="cd-input"
                placeholder="写下你的回复..."
                rows="2"
              />
              <div class="comment__reply-actions">
                <button class="cd-button" type="button" @click="replyingTo = null">取消</button>
                <button
                  class="cd-button primary"
                  type="button"
                  :disabled="submitting || !replyContent.trim()"
                  @click="submitReply(comment.id)"
                >
                  <Send :size="14" />
                  发送
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="comment-panel__empty">
        <MessageSquare :size="32" />
        <p>暂无评论</p>
        <p>发表第一条评论吧</p>
      </div>
    </div>

    <footer v-if="canComment" class="comment-panel__footer">
      <textarea
        v-model="newComment"
        class="cd-input"
        placeholder="写下你的评论..."
        rows="2"
        @keydown.ctrl.enter="submitComment"
      />
      <button
        class="cd-button primary"
        type="button"
        :disabled="submitting || !newComment.trim()"
        @click="submitComment"
      >
        <Send :size="14" />
        发送
      </button>
    </footer>
    <footer v-else class="comment-panel__footer comment-panel__footer--readonly">
      <p>仅管理员可发表评论</p>
    </footer>
  </div>
</template>
