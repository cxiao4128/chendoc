import { computed, nextTick, onBeforeUnmount, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { ApiError, getShareByDocApi, listDocVersionsApi } from "@/services/api";
import { useDocAutosave } from "../../../composables/useDocAutosave";
import { useDocEditorContext } from "../../../composables/useDocEditorContext";
import { useNetworkStatus } from "../../../composables/useNetworkStatus";
import { useSyncState } from "../../../composables/useSyncState";
import { useAuthStore } from "../../../stores/auth";
import { useDocStore } from "../../../stores/doc";
import { readLocalDraft, removeLocalDraft, writeLocalDraft } from "../../../services/localDraft";
import { nativeConfirm } from "../../../services/nativeDialog";
import { normalizeError } from "../../../utils/error";
import { textLengthFromContentJson } from "../../../utils/documentText";
import { isAbortError, waitForSaving } from "./docEditorShellHelpers";

const DETAIL_ERROR_USER_FRIENDLY = "文档详情加载失败，请稍后重试。";
const AUTO_SAVE_DELAY_MS = 1200;
const MAX_SAVE_RETRIES = 3;

export function useDocEditorShell() {
  const ctx = useDocEditorContext();
  const route = useRoute();
  const docs = useDocStore();
  const auth = useAuthStore();
  const { status: networkStatus } = useNetworkStatus();
  const {
    docUid, current, title, draft, saveState, saveError, dirty, documentWordCount,
    share, shareLoading, shareEnabled, shareCodeInput, customSlugInput, sharePassword, shareHasPassword, shareStatus,
    versions, toc
  } = ctx;
  shareLoading.value = true;

  let saving = false;
  let queuedWhileSaving = false;
  let localDraftTimer: number | undefined;
  let routeChangeSequence = 0;
  const localSync = useSyncState({
    isDirty: () => dirty.value,
    isSaving: () => saving,
    saveError: () => saveError.value || null,
    networkStatus: () => networkStatus.value,
  });
  const showDesktopDocTree = computed(() => docs.loadingList || docs.docs.some((doc) => doc.docUid !== docUid.value));

  ctx.auth = auth;
  ctx.docs = docs;
  ctx.sync = localSync;
  ctx.showDesktopDocTree = showDesktopDocTree;
  ctx.onEditorChange = handleEditorChange;
  ctx.retryLoadDetail = () => { void load(); };
  ctx.flushPendingSave = flushPendingSave;
  ctx.retrySave = () => { void doSave(); };

  const { clear: clearSaveTimer, schedule: scheduleSave } = useDocAutosave({
    delayMs: AUTO_SAVE_DELAY_MS,
    isSaving: () => saving,
    onQueued: () => { queuedWhileSaving = true; },
    save: () => doSave()
  });

  function markDirty() {
    if (ctx.hydrating.value || !current.value) return;
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

  function flushEditorContent() {
    if (!current.value) return;
    window.dispatchEvent(new CustomEvent("chendoc:flush-editor-content", {
      detail: { docUid: current.value.docUid }
    }));
  }

  async function persistLocalDraft() {
    flushEditorContent();
    await nextTick();
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

  async function doSave(retryCount = 0) {
    if (!current.value || saving || !dirty.value || networkStatus.value === "offline") return;
    const targetDocUid = current.value.docUid;
    const titleSnapshot = title.value;
    const draftSnapshot = draft.value;
    saving = true;
    saveState.value = "saving";
    saveError.value = "";
    try {
      const savedDoc = await docs.saveDoc(targetDocUid, {
        title: titleSnapshot.trim() || "未命名文档",
        ...(draftSnapshot ? { contentJson: draftSnapshot.contentJson } : {})
      });
      if (current.value?.docUid === targetDocUid) {
        current.value = savedDoc;
      }
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
      const retryable = !(error instanceof ApiError) || error.status >= 500;
      if (retryable && retryCount < MAX_SAVE_RETRIES) {
        saving = false;
        localSync.markRetry(retryCount + 1);
        window.setTimeout(() => { void doSave(retryCount + 1); }, Math.min(1000 * Math.pow(2, retryCount), 8000));
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
    flushEditorContent();
    await nextTick();
    clearSaveTimer();
    if (saving) {
      queuedWhileSaving = true;
      await waitForSaving(() => saving);
    }
    if (dirty.value) await doSave();
  }

  async function loadShare(docUidValue: string) {
    const response = await getShareByDocApi(docUidValue);
    if (docUidValue !== docUid.value) return;
    share.value = response.share;
    shareEnabled.value = !!response.share?.isEnabled || (!auth?.isAdmin && response.share?.reviewStatus === "pending");
    shareCodeInput.value = response.share?.shareCode ? String(response.share.shareCode) : "";
    customSlugInput.value = response.share?.customSlug || "";
    sharePassword.value = "";
    shareHasPassword.value = !!response.share?.hasPassword;
    shareStatus.value = "";
  }

  async function loadVersions(docUidValue: string) {
    const response = await listDocVersionsApi(docUidValue);
    if (docUidValue !== docUid.value) return;
    versions.value = response.versions;
  }

  async function load() {
    const requestedDocUid = docUid.value;
    share.value = null;
    shareLoading.value = true;
    toc.value = [];
    versions.value = [];
    saveError.value = "";
    ctx.loading.value = true;
    ctx.error.value = "";
    ctx.hydrating.value = true;
    try { await docs.loadList(); } catch { /* ignore */ }
    try {
      const doc = await docs.loadDoc(requestedDocUid);
      if (requestedDocUid !== docUid.value) return;
      current.value = doc;
      title.value = doc.title;
      draft.value = null;
      documentWordCount.value = textLengthFromContentJson(doc.contentJson);
      dirty.value = false;
      saveState.value = "idle";
      await restoreLocalDraftIfNeeded(doc);
      const results = await Promise.allSettled([loadShare(doc.docUid), loadVersions(doc.docUid)]);
      if (results[0].status === "rejected") {
        share.value = null;
        shareStatus.value = "分享信息加载失败，可稍后重试。";
      }
      if (results[1].status === "rejected") versions.value = [];
    } catch (error) {
      if (!isAbortError(error) && requestedDocUid === docUid.value) {
        ctx.error.value = normalizeError(error) || DETAIL_ERROR_USER_FRIENDLY;
      }
    } finally {
      if (requestedDocUid === docUid.value) {
        ctx.loading.value = false;
        ctx.hydrating.value = false;
        shareLoading.value = false;
      }
    }
  }

  async function restoreLocalDraftIfNeeded(doc: NonNullable<typeof current.value>) {
    const localDraft = await readLocalDraft(doc.docUid).catch(() => null);
    if (!localDraft || localDraft.contentJson === doc.contentJson) return;
    const serverChanged = localDraft.serverRevision !== doc.revision;
    const restore = !serverChanged || await nativeConfirm({
      title: "恢复本地草稿",
      message: "检测到未保存草稿，但服务器文档也已更新。恢复会以本地草稿继续编辑。",
      confirmText: "恢复草稿"
    });
    if (!restore) return;
    title.value = localDraft.title;
    draft.value = { contentJson: localDraft.contentJson, textLength: localDraft.textLength };
    documentWordCount.value = localDraft.textLength;
    dirty.value = true;
    saveState.value = "pending";
    scheduleSave();
  }

  function handleEditorChange(payload: { contentJson: string; textLength: number }) {
    draft.value = payload;
    documentWordCount.value = payload.textLength;
    markDirty();
  }

  function beforeUnload(event: BeforeUnloadEvent) {
    flushEditorContent();
    if (!dirty.value) return;
    void persistLocalDraft();
    event.preventDefault();
    event.returnValue = "";
  }

  function handleVisibilityChange() {
    flushEditorContent();
    if (document.visibilityState === "hidden" && dirty.value) void persistLocalDraft();
  }

  watch(() => route.params.docUid, async (newDocUid) => {
    const sequence = ++routeChangeSequence;
    await nextTick();
    if (sequence !== routeChangeSequence) return;
    flushEditorContent();
    await nextTick();
    if (dirty.value) await persistLocalDraft();
    clearSaveTimer();
    if (localDraftTimer) {
      window.clearTimeout(localDraftTimer);
      localDraftTimer = undefined;
    }
    ctx.docUid.value = String(newDocUid || "");
    void load();
  });
  watch(title, markDirty);
  watch(() => networkStatus.value, (newStatus, oldStatus) => {
    if (oldStatus === "offline" && newStatus === "online" && dirty.value && !saving) void doSave();
  });

  onMounted(() => {
    ctx.docUid.value = String(route.params.docUid || "");
    void load();
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", persistLocalDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onBeforeUnmount(() => {
    flushEditorContent();
    clearSaveTimer();
    if (localDraftTimer) window.clearTimeout(localDraftTimer);
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("pagehide", persistLocalDraft);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (dirty.value) {
      void persistLocalDraft().finally(() => {
        if (dirty.value) void doSave();
      });
    }
  });
}
