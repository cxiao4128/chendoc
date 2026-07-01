<script setup lang="ts">
// ChenDoc v3.0.0 - 文档评论面板组件
import { ref, computed, onMounted, watch } from "vue";
import { MessageSquare, Send, ThumbsUp, ThumbsDown, MoreHorizontal, Trash2, Edit3, Reply } from "lucide-vue-next";
import { listDocComments, createDocComment, deleteDocComment, toggleCommentReaction, type Comment } from "../../api/comments";
import { useAuthStore } from "../../stores/auth";

const props = defineProps<{
  docUid: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const auth = useAuthStore();
const canComment = computed(() => auth.isAdmin || auth.isSuperAdmin);

const comments = ref<Comment[]>([]);
const loading = ref(false);
const newComment = ref("");
const replyingTo = ref<number | null>(null);
const replyContent = ref("");
const submitting = ref(false);
const error = ref("");

// 按父评论分组
const rootComments = computed(() => {
  return comments.value
    .filter(c => c.parentId === null && c.status === "active")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
});

function getReplies(parentId: number) {
  return comments.value
    .filter(c => c.parentId === parentId && c.status === "active")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

async function loadComments() {
  loading.value = true;
  error.value = "";
  try {
    comments.value = await listDocComments(props.docUid);
  } catch (e: any) {
    error.value = e.message || "加载评论失败";
  } finally {
    loading.value = false;
  }
}

async function submitComment() {
  if (!newComment.value.trim()) return;
  submitting.value = true;
  error.value = "";
  try {
    const comment = await createDocComment(props.docUid, { content: newComment.value.trim() });
    comments.value.unshift(comment);
    newComment.value = "";
  } catch (e: any) {
    error.value = e.message || "发送评论失败";
  } finally {
    submitting.value = false;
  }
}

async function submitReply(parentId: number) {
  if (!replyContent.value.trim()) return;
  submitting.value = true;
  error.value = "";
  try {
    const comment = await createDocComment(props.docUid, {
      content: replyContent.value.trim(),
      parentId,
    });
    comments.value.push(comment);
    replyContent.value = "";
    replyingTo.value = null;
  } catch (e: any) {
    error.value = e.message || "发送回复失败";
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(comment: Comment) {
  if (!confirm("确定删除此评论？")) return;
  try {
    await deleteDocComment(comment.id);
    const idx = comments.value.findIndex(c => c.id === comment.id);
    if (idx !== -1) {
      comments.value[idx] = { ...comments.value[idx], status: "deleted" };
    }
  } catch (e: any) {
    error.value = e.message || "删除失败";
  }
}

async function handleReaction(comment: Comment, reaction: "like" | "dislike") {
  try {
    const reactions = await toggleCommentReaction(comment.id, reaction);
    const idx = comments.value.findIndex(c => c.id === comment.id);
    if (idx !== -1) {
      comments.value[idx] = { ...comments.value[idx], reactions };
    }
  } catch (e: any) {
    error.value = e.message || "操作失败";
  }
}

onMounted(() => {
  void loadComments();
});

watch(() => props.docUid, () => {
  void loadComments();
});
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
      <!-- 加载状态 -->
      <div v-if="loading" class="comment-panel__loading">
        <span class="cd-skeleton" />
        <span class="cd-skeleton" />
      </div>

      <!-- 错误提示 -->
      <p v-if="error" class="comment-panel__error">{{ error }}</p>

      <!-- 评论列表 -->
      <div v-else-if="rootComments.length" class="comment-panel__list">
        <article v-for="comment in rootComments" :key="comment.id" class="comment">
          <header class="comment__header">
            <span class="comment__author">{{ comment.userName }}</span>
            <span class="comment__time">{{ formatDate(comment.createdAt) }}</span>
          </header>

          <!-- 批注选区显示 -->
          <div v-if="comment.selectionText" class="comment__selection">
            "{{ comment.selectionText }}"
          </div>

          <p class="comment__content">{{ comment.content }}</p>

          <footer class="comment__actions">
            <button
              class="comment__action"
              :class="{ active: comment.reactions?.some(r => r.reaction === 'like' && r.userReacted) }"
              type="button"
              @click="handleReaction(comment, 'like')"
            >
              <ThumbsUp :size="14" />
              <span>{{ comment.reactions?.find(r => r.reaction === 'like')?.count || 0 }}</span>
            </button>
            <button
              class="comment__action"
              :class="{ active: comment.reactions?.some(r => r.reaction === 'dislike' && r.userReacted) }"
              type="button"
              @click="handleReaction(comment, 'dislike')"
            >
              <ThumbsDown :size="14" />
              <span>{{ comment.reactions?.find(r => r.reaction === 'dislike')?.count || 0 }}</span>
            </button>
            <button v-if="canComment" class="comment__action" type="button" @click="replyingTo = comment.id">
              <Reply :size="14" />
              <span>回复</span>
            </button>
            <button v-if="canComment" class="comment__action comment__action--danger" type="button" @click="handleDelete(comment)">
              <Trash2 :size="14" />
            </button>
          </footer>

          <!-- 回复列表 -->
          <div v-if="getReplies(comment.id).length || replyingTo === comment.id" class="comment__replies">
            <article v-for="reply in getReplies(comment.id)" :key="reply.id" class="reply">
              <header class="comment__header">
                <span class="comment__author">{{ reply.userName }}</span>
                <span class="comment__time">{{ formatDate(reply.createdAt) }}</span>
              </header>
              <p class="comment__content">{{ reply.content }}</p>
            </article>

            <!-- 回复输入 -->
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

      <!-- 空状态 -->
      <div v-else class="comment-panel__empty">
        <MessageSquare :size="32" />
        <p>暂无评论</p>
        <p>发表第一条评论吧</p>
      </div>
    </div>

    <!-- 新评论输入（仅管理员可见） -->
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

<style scoped>
.comment-panel {
  display: grid;
  grid-template-rows: auto 1fr auto;
  width: 360px;
  max-height: 100%;
  background: var(--cd-panel);
  border-left: 1px solid var(--cd-border);
}

.comment-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cd-border);
  font-size: 14px;
  font-weight: 700;
  color: var(--cd-text);
}

.comment-panel__count {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--cd-paper-soft);
  font-size: 12px;
  font-weight: 600;
  color: var(--cd-muted);
}

.comment-panel__close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--cd-muted);
  font-size: 18px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.comment-panel__close:hover {
  background: var(--cd-paper-soft);
}

.comment-panel__body {
  overflow-y: auto;
  padding: 12px 16px;
}

.comment-panel__loading {
  display: grid;
  gap: 8px;
}

.comment-panel__loading span {
  height: 60px;
}

.comment-panel__error {
  margin: 0;
  padding: 8px 12px;
  border-radius: var(--cd-radius);
  background: var(--cd-danger-soft);
  color: var(--cd-danger);
  font-size: 12px;
}

.comment-panel__list {
  display: grid;
  gap: 16px;
}

.comment {
  display: grid;
  gap: 8px;
}

.comment__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.comment__author {
  font-size: 13px;
  font-weight: 700;
  color: var(--cd-text);
}

.comment__time {
  font-size: 11px;
  color: var(--cd-muted);
}

.comment__selection {
  padding: 8px;
  border-left: 3px solid var(--cd-primary);
  background: var(--cd-primary-soft);
  font-size: 12px;
  color: var(--cd-text-secondary);
  font-style: italic;
  border-radius: 0 var(--cd-radius) var(--cd-radius) 0;
}

.comment__content {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cd-text);
}

.comment__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.comment__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--cd-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.comment__action:hover {
  background: var(--cd-paper-soft);
  color: var(--cd-text);
}

.comment__action.active {
  color: var(--cd-primary);
}

.comment__action--danger:hover {
  background: var(--cd-danger-soft);
  color: var(--cd-danger);
}

.comment__replies {
  display: grid;
  gap: 12px;
  margin-top: 8px;
  padding-left: 16px;
  border-left: 2px solid var(--cd-border);
}

.reply {
  display: grid;
  gap: 4px;
}

.reply .comment__content {
  font-size: 12px;
}

.comment__reply-form {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.comment__reply-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.comment-panel__empty {
  display: grid;
  place-items: center;
  padding: 32px;
  color: var(--cd-muted);
  text-align: center;
}

.comment-panel__empty svg {
  margin-bottom: 8px;
}

.comment-panel__empty p {
  margin: 0;
  font-size: 13px;
}

.comment-panel__empty p:last-child {
  font-size: 12px;
  color: var(--cd-faint);
}

.comment-panel__footer {
  display: grid;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--cd-border);
}

.comment-panel__footer textarea {
  resize: none;
}

.comment-panel__footer .cd-button {
  justify-self: end;
}

.comment-panel__footer--readonly {
  display: flex;
  align-items: center;
  justify-content: center;
}

.comment-panel__footer--readonly p {
  margin: 0;
  font-size: 12px;
  color: var(--cd-muted);
}
</style>