<script setup lang="ts">
/**
 * DocEditorShell.vue - 编辑器容器组件
 *
 * 职责：
 * - 路由参数解析和加载 orchestration
 * - 状态提升（dirty、saveState、error）
 * - 上下文初始化
 * - 路由守卫和清理逻辑
 */
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDocAutosave } from "../../../composables/useDocAutosave";
import { useDocShare } from "../../../composables/useDocShare";
import { useDocVersions } from "../../../composables/useDocVersions";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";
import { useNetworkStatus } from "../../../composables/useNetworkStatus";
import { useSyncState } from "../../../composables/useSyncState";
import { useAuthStore } from "../../../stores/auth";
import { useDocStore } from "../../../stores/doc";
import { useDocEditorContext } from "../../../composables/useDocEditorContext";
import { normalizeError } from "../../../utils/error";
import { readLocalDraft, removeLocalDraft, writeLocalDraft } from "../../../services/localDraft";
import { nativeConfirm } from "../../../services/nativeDialog";
import { getShareByDocApi } from "../../../api/shares";
import { listDocVersionsApi } from "../../../api/docs";

// 获取共享上下文
const ctx = useDocEditorContext();

const DETAIL_ERROR_USER_FRIENDLY = "文档详情加载失败，请稍后重试。";
const AUTO_SAVE_DELAY_MS = 1200;
const MAX_SAVE_RETRIES = 3;

// 路由和 Store
const route = useRoute();
const router = useRouter();
const docs = useDocStore();
const auth = useAuthStore();
const { docsPath } = useWorkspaceRoutes();

// 设置共享上下文
ctx.auth = auth;
ctx.docs = docs;

// 网络状态
const { status: networkStatus } = useNetworkStatus();

// 解构上下文属性
const {
  docUid, current, loading,
  title, draft, saveState, saveError, dirty, documentWordCount,
  share, shareEnabled, shareCodeInput, sharePassword, shareHasPassword, shareStatus,
  versions, toc,
  sync: _syncCtx, onEditorChange: _onEditorChangeCtx, retryLoadDetail: _retryLoadDetailCtx, flushPendingSave: _flushPendingSaveCtx, retrySave: _retrySaveCtx
} = ctx;

const hydrating = ref(false);
const localDetailError = ref("");
const localSync = useSyncState({
  isDirty: () => dirty.value,
  isSaving: () => saving,
  saveError: () => saveError.value || null,
  networkStatus: () => networkStatus.value,
});

// 同步状态
ctx.sync = localSync;

// Computed
const error = computed(() => normalizeError((docs as unknown as { detailError?: unknown }).detailError, DETAIL_ERROR_USER_FRIENDLY) || localDetailError.value);
const showDesktopDocTree = computed(() => docs.loadingList || docs.docs.some((doc) => doc.docUid !== docUid.value));
const showDesktopLeft = computed(() => showDesktopDocTree.value || toc.value.length > 0);

// 保存状态
let saving = false;
let queuedWhileSaving = false;
let localDraftTimer: number | undefined;

// 自动保存
const { clear: clearSaveTimer, schedule: scheduleSave } = useDocAutosave({
  delayMs: AUTO_SAVE_DELAY_MS,
  isSaving: () => saving,
  onQueued: () => { queuedWhileSaving = true; },
  save: () => doSave()
});

// 帮助函数
function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : typeof error === "object" && !!error && "name" in error && (error as { name?: unknown }).name === "AbortError";
}

function markDirty() {
  if (hydrating.value || !current.value) return;
  dirty.value = true;
  saveError.value = "";
  saveState.value = "pending";
  scheduleSave();
  scheduleLocalDraft();
}

function scheduleLocalDraft() {
  if (localDraftTimer) window.clearTimeout(localDraftTimer);
  localDraftTimer = window.setTimeout(() => {
    localDraftTimer = undefined;
    void persistLocalDraft();
  }, 800);
}

async function persistLocalDraft() {
  if (!current.value || !dirty.value) return;
  await writeLocalDraft({
    docUid: current.value.docUid,
    title: title.value,
    contentJson: draft.value?.contentJson ?? current.value.contentJson,
    textLength: draft.value?.textLength ?? documentWordCount.value,
    serverRevision: current.value.revision,
    savedAt: Date.now()
  });
}

// 保存逻辑
async function doSave(retryCount = 0) {
  if (!current.value || saving || !dirty.value) return;
  if (networkStatus.value === "offline") return;

  const targetDocUid = current.value.docUid;
  const titleSnapshot = title.value;
  const draftSnapshot = draft.value;
  saving = true;
  saveState.value = "saving";
  saveError.value = "";
  try {
    await docs.saveDoc(targetDocUid, {
      title: titleSnapshot.trim() || "未命名文档",
      ...(draftSnapshot ? { contentJson: draftSnapshot.contentJson } : {})
    });
    if (current.value?.docUid === targetDocUid && title.value === titleSnapshot && draft.value === draftSnapshot) {
      draft.value = null;
      dirty.value = false;
      saveState.value = "idle";
      localSync.markSynced();
      void removeLocalDraft(targetDocUid);
    } else if (current.value?.docUid === targetDocUid) {
      dirty.value = true;
      saveState.value = "pending";
    }
  } catch (error) {
    if (retryCount < MAX_SAVE_RETRIES) {
      saving = false;
      localSync.markRetry(retryCount + 1);
      const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
      window.setTimeout(() => { void doSave(retryCount + 1); }, delay);
      return;
    }
    saveError.value = normalizeError(error) || "保存失败，当前编辑内容已保留在本地。";
    dirty.value = true;
    saveState.value = "error";
  } finally {
    saving = false;
    if (queuedWhileSaving && saveState.value !== "error" && dirty.value) {
      queuedWhileSaving = false;
      void doSave();
    }
  }
}

async function flushPendingSave() {
  clearSaveTimer();
  if (saving) {
    queuedWhileSaving = true;
    await new Promise<void>(resolve => {
      const check = () => {
        if (!saving) { resolve(); return; }
        setTimeout(check, 50);
      };
      check();
    });
  }
  if (dirty.value) await doSave();
}

// 加载逻辑
async function loadShare(docUidValue: string) {
  const response = await getShareByDocApi(docUidValue);
  share.value = response.share;
  shareEnabled.value = !!response.share?.isEnabled || (!auth.isAdmin && response.share?.reviewStatus === "pending");
  shareCodeInput.value = response.share?.shareCode ? String(response.share.shareCode) : "";
  sharePassword.value = "";
  shareHasPassword.value = !!response.share?.hasPassword;
  shareStatus.value = "";
}

async function loadVersions(docUidValue: string) {
  const response = await listDocVersionsApi(docUidValue);
  versions.value = response.versions;
}

async function load() {
  const requestedDocUid = docUid.value;
  share.value = null;
  toc.value = [];
  versions.value = [];
  localDetailError.value = "";
  saveError.value = "";
  hydrating.value = true;
  try {
    await docs.loadList();
  } catch { /* ignore */ }
  try {
    const doc = await docs.loadDoc(requestedDocUid);
    if (requestedDocUid !== docUid.value) return;
    title.value = doc.title;
    draft.value = null;
    dirty.value = false;
    saveState.value = "idle";
    const localDraft = await readLocalDraft(doc.docUid).catch(() => null);
    if (localDraft && localDraft.contentJson !== doc.contentJson) {
      const serverChanged = localDraft.serverRevision !== doc.revision;
      const restore = !serverChanged || await nativeConfirm({
        title: "恢复本地草稿",
        message: "检测到未保存草稿，但服务器文档也已更新。恢复会以本地草稿继续编辑。",
        confirmText: "恢复草稿"
      });
      if (restore) {
        title.value = localDraft.title;
        draft.value = { contentJson: localDraft.contentJson, textLength: localDraft.textLength };
        dirty.value = true;
        saveState.value = "pending";
        scheduleSave();
      }
    }
    const results = await Promise.allSettled([loadShare(doc.docUid), loadVersions(doc.docUid)]);
    if (results[0].status === "rejected") {
      share.value = null;
      shareStatus.value = "分享信息加载失败，可稍后重试。";
    }
    if (results[1].status === "rejected") {
      versions.value = [];
    }
  } catch (error) {
    if (!isAbortError(error) && requestedDocUid === docUid.value) {
      localDetailError.value = normalizeError(error) || DETAIL_ERROR_USER_FRIENDLY;
    }
  } finally {
    if (requestedDocUid === docUid.value) hydrating.value = false;
  }
}

function handleEditorChange(payload: { contentJson: string; textLength: number }) {
  draft.value = payload;
  markDirty();
}

// 挂载方法到上下文
ctx.onEditorChange = handleEditorChange;
ctx.retryLoadDetail = () => { void load(); };
ctx.flushPendingSave = flushPendingSave;
ctx.retrySave = () => { void doSave(); };

// 路由守卫
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  void persistLocalDraft();
  event.preventDefault();
  event.returnValue = "";
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden" && dirty.value) {
    void persistLocalDraft();
  }
}

watch(() => route.params.docUid, load);
watch(title, markDirty);
watch(() => networkStatus.value, (newStatus, oldStatus) => {
  if (oldStatus === "offline" && newStatus === "online" && dirty.value && !saving) {
    void doSave();
  }
});

onMounted(() => {
  void load();
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", persistLocalDraft);
  document.addEventListener("visibilitychange", handleVisibilityChange);
});

onBeforeUnmount(() => {
  clearSaveTimer();
  if (localDraftTimer) window.clearTimeout(localDraftTimer);
  window.removeEventListener("beforeunload", beforeUnload);
  window.removeEventListener("pagehide", persistLocalDraft);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (dirty.value) void doSave();
});
</script>

<template>
  <!-- Shell 组件不渲染任何内容，它只负责状态管理 -->
  <slot />
</template>
