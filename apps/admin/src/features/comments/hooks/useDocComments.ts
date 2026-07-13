import { computed, onMounted, ref, watch } from "vue";
import { commentsApi, type Comment } from "../../../services/api/comments.api";
import { nativeConfirm } from "../../../services/nativeDialog";
import { useAuthStore } from "../../../stores/auth";

export function formatCommentRelativeDate(dateStr: string) {
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

export function useDocComments(docUid: () => string) {
  const auth = useAuthStore();
  const canComment = computed(() => auth.isAdmin || auth.isSuperAdmin);
  const comments = ref<Comment[]>([]);
  const loading = ref(false);
  const newComment = ref("");
  const replyingTo = ref<number | null>(null);
  const replyContent = ref("");
  const submitting = ref(false);
  const error = ref("");
  let requestSequence = 0;

  const rootComments = computed(() => {
    return comments.value
      .filter((comment) => comment.parentId === null && comment.status === "active")
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  });

  function getReplies(parentId: number) {
    return comments.value
      .filter((comment) => comment.parentId === parentId && comment.status === "active")
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  }

  async function loadComments() {
    const targetDocUid = docUid();
    const sequence = ++requestSequence;
    loading.value = true;
    error.value = "";
    try {
      const result = await commentsApi.listDoc(targetDocUid);
      if (sequence !== requestSequence || docUid() !== targetDocUid) return;
      comments.value = result;
    } catch (loadError) {
      if (sequence === requestSequence && docUid() === targetDocUid) {
        error.value = loadError instanceof Error ? loadError.message : "加载评论失败";
      }
    } finally {
      if (sequence === requestSequence && docUid() === targetDocUid) loading.value = false;
    }
  }

  async function submitComment() {
    if (!newComment.value.trim()) return;
    const targetDocUid = docUid();
    const content = newComment.value.trim();
    const sequence = ++requestSequence;
    submitting.value = true;
    error.value = "";
    try {
      const comment = await commentsApi.createDoc(targetDocUid, { content });
      if (sequence !== requestSequence || docUid() !== targetDocUid) return;
      comments.value.unshift(comment);
      newComment.value = "";
      submitting.value = false;
      void loadComments();
    } catch (submitError) {
      if (sequence === requestSequence && docUid() === targetDocUid) {
        error.value = submitError instanceof Error ? submitError.message : "发送评论失败";
      }
    } finally {
      if (docUid() === targetDocUid) submitting.value = false;
    }
  }

  async function submitReply(parentId: number) {
    if (!replyContent.value.trim()) return;
    const targetDocUid = docUid();
    const content = replyContent.value.trim();
    const sequence = ++requestSequence;
    submitting.value = true;
    error.value = "";
    try {
      const comment = await commentsApi.createDoc(targetDocUid, {
        content,
        parentId
      });
      if (sequence !== requestSequence || docUid() !== targetDocUid) return;
      comments.value.push(comment);
      replyContent.value = "";
      replyingTo.value = null;
      submitting.value = false;
      void loadComments();
    } catch (submitError) {
      if (sequence === requestSequence && docUid() === targetDocUid) {
        error.value = submitError instanceof Error ? submitError.message : "发送回复失败";
      }
    } finally {
      if (docUid() === targetDocUid) submitting.value = false;
    }
  }

  async function handleDelete(comment: Comment) {
    const confirmed = await nativeConfirm({
      title: "删除评论",
      message: "确定删除此评论？",
      confirmText: "删除",
      danger: true
    });
    if (!confirmed) return;
    try {
      await commentsApi.deleteDoc(comment.id);
      const index = comments.value.findIndex((item) => item.id === comment.id);
      if (index !== -1) comments.value[index] = { ...comments.value[index], status: "deleted" };
    } catch (deleteError) {
      error.value = deleteError instanceof Error ? deleteError.message : "删除失败";
    }
  }

  async function handleReaction(comment: Comment, reaction: "like" | "dislike") {
    try {
      const reactions = await commentsApi.toggleReaction(comment.id, reaction);
      const index = comments.value.findIndex((item) => item.id === comment.id);
      if (index !== -1) comments.value[index] = { ...comments.value[index], reactions };
    } catch (reactionError) {
      error.value = reactionError instanceof Error ? reactionError.message : "操作失败";
    }
  }

  onMounted(() => {
    void loadComments();
  });

  watch(docUid, () => {
    requestSequence += 1;
    comments.value = [];
    newComment.value = "";
    replyingTo.value = null;
    replyContent.value = "";
    submitting.value = false;
    error.value = "";
    void loadComments();
  });

  return {
    canComment,
    comments,
    loading,
    newComment,
    replyingTo,
    replyContent,
    submitting,
    error,
    rootComments,
    getReplies,
    loadComments,
    submitComment,
    submitReply,
    handleDelete,
    handleReaction,
    formatCommentRelativeDate
  };
}
