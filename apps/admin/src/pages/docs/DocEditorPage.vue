<script setup lang="ts">
import { computed, defineAsyncComponent, h, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { ArrowLeft, BookOpen, Copy, ExternalLink, Eye, Link2, MoreHorizontal, PanelRightOpen, RefreshCw, RotateCcw, Save, Trash2, X } from "lucide-vue-next";
import DocTree from "../../components/docs/DocTree.vue";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import DocEditorSharePanel from "./components/DocEditorSharePanel.vue";
import { useIsMobileViewport } from "../../composables/useViewport";
import { useDocAutosave } from "../../composables/useDocAutosave";
import { useDocShareState } from "../../composables/useDocShare";
import { useDocVersionState } from "../../composables/useDocVersions";
import { useWorkspaceRoutes } from "../../composables/useWorkspaceRoutes";
import { nativeConfirm } from "../../services/nativeDialog";
import { deleteDocApi, getDocVersionPreviewApi, listDocVersionsApi, restoreDocVersionApi, restoreDocVersionAsCopyApi, type DocVersion } from "../../api/docs";
import { createShareApi, getShareByDocApi, updateShareApi, type SharePatch } from "../../api/shares";
import { useAuthStore } from "../../stores/auth";
import { useDocStore } from "../../stores/doc";
import { normalizeError } from "../../utils/error";
import { readLocalDraft, removeLocalDraft, writeLocalDraft } from "../../services/localDraft";
import "./css/doc-editor.css";

interface TocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

type DocStoreCompat = {
  detailError?: unknown;
};

const EditorLoadingSkeleton = {
  name: "EditorLoadingSkeleton",
  setup() {
    return () => h("div", { class: "doc-editor-page__editor-skeleton", "aria-label": "编辑器加载中" }, [
      h("span", { class: "cd-skeleton" }),
      h("span", { class: "cd-skeleton" }),
      h("span", { class: "cd-skeleton" }),
      h("span", { class: "cd-skeleton" })
    ]);
  }
};

const ChendocEditor = defineAsyncComponent({
  loader: () => import("../../components/editor/ChendocEditor.vue"),
  loadingComponent: EditorLoadingSkeleton,
  delay: 120
});

const route = useRoute();
const router = useRouter();
const docs = useDocStore();
const auth = useAuthStore();
const isMobile = useIsMobileViewport();
const { docsPath, docPath } = useWorkspaceRoutes();

const title = ref("");
const draft = ref<{ contentJson: string; textLength: number } | null>(null);
const saveState = ref<"idle" | "pending" | "saving" | "saved" | "error">("idle");
const savedAt = ref("");
const { share, shareLoading, shareEnabled, sharePassword, shareCodeInput, shareStatus, shareHasPassword, sharePanelOpen } = useDocShareState();
const copied = ref(false);
const deleteOpen = ref(false);
const hydrating = ref(false);
const dirty = ref(false);
const toc = ref<TocItem[]>([]);
const { versions, selectedVersion, versionPreview, versionPreviewLoading } = useDocVersionState();
const editorRefresh = ref(0);
const mobileSheet = ref<null | "docs" | "toc" | "share" | "versions" | "more">(null);
const localDetailError = ref("");
const saveError = ref("");
let shareSaveTimer: number | undefined;
let saving = false;
let queuedWhileSaving = false;
let syncingShare = false;
let localDraftTimer: number | undefined;

const AUTO_SAVE_DELAY_MS = 1200;

const docUid = computed(() => String(route.params.docUid || ""));
const current = computed(() => docs.current?.docUid === docUid.value ? docs.current : null);
const editorKey = computed(() => `${current.value?.docUid || "none"}-${editorRefresh.value}`);
const detailErrorText = computed(() => normalizeError((docs as unknown as DocStoreCompat).detailError, "文档详情加载失败，请稍后重试。") || localDetailError.value);
const saveErrorText = computed(() => saveError.value || "保存失败，当前编辑内容仍保留在本地。");
const shareUrl = computed(() => {
  if (!share.value?.isEnabled) return "";
  return `${location.origin}/r/${share.value.shareCode}`;
});
const shareReviewText = computed(() => {
  if (!share.value?.reviewStatus || share.value.reviewStatus === "approved") return "";
  if (share.value.reviewStatus === "pending") return "等待管理员审核，通过后才会公开。";
  return share.value.reviewNote ? `审核未通过：${share.value.reviewNote}` : "审核未通过，可修改后重新提交。";
});
const saveText = computed(() => {
  if (saveState.value === "saving") return "保存中";
  if (saveState.value === "pending") return "待保存";
  if (saveState.value === "error") return "保存失败";
  if (savedAt.value) return `已保存 ${savedAt.value}`;
  return "自动保存";
});
const documentWordCount = computed(() => {
  if (draft.value) return draft.value.textLength;
  const html = current.value?.contentHtml || "";
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, "").length;
});
const showDesktopDocTree = computed(() => docs.loadingList || docs.docs.some((doc) => doc.docUid !== docUid.value));
const showDesktopLeft = computed(() => showDesktopDocTree.value || toc.value.length > 0);
const mobileSheetTitle = computed(() => {
  if (mobileSheet.value === "docs") return "切换文档";
  if (mobileSheet.value === "toc") return "目录导航";
  if (mobileSheet.value === "share") return "发布设置";
  if (mobileSheet.value === "versions") return "历史版本";
  if (mobileSheet.value === "more") return "更多操作";
  return "";
});
const shareCanOpenPublicly = computed(() => !!shareUrl.value);
const shareMessage = computed(() => {
  if (shareLoading.value) return "自动更新中";
  return shareStatus.value || "修改后自动更新，密码需点确认才生效";
});
const shareStatusIsError = computed(() => shareStatus.value.includes("失败") || shareStatus.value.includes("占用") || shareStatus.value.includes("保留"));
const mobileDocBadge = computed(() => {
  if (share.value?.isEnabled) return "公开分享中";
  if (share.value?.reviewStatus === "pending") return "审核中";
  if (share.value?.reviewStatus === "rejected") return "审核未通过";
  return "当前仅内部可见";
});
const currentStatusText = computed(() => current.value?.status === "published" ? "已发布" : "草稿");
const shareStateText = computed(() => {
  if (!share.value) return current.value?.status === "published" ? "已发布 · 未公开" : "草稿";
  if (share.value.reviewStatus === "pending") return "已发布 → 待审核";
  if (share.value.reviewStatus === "rejected") return "已发布 → 已拒绝";
  if (share.value.isEnabled) return "已发布 → 已公开";
  return "已发布 → 已关闭";
});
const shareExpiryText = computed(() => share.value?.expireAt ? formatDate(share.value.expireAt) : "长期有效");
const shareAccessText = computed(() => share.value?.isEnabled ? (shareHasPassword.value ? "持有链接和密码的人" : "持有链接的人") : "当前无人可访问");

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : typeof error === "object" && !!error && "name" in error && (error as { name?: unknown }).name === "AbortError";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
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

const { clear: clearSaveTimer, schedule: scheduleSave } = useDocAutosave({
  delayMs: AUTO_SAVE_DELAY_MS,
  isSaving: () => saving,
  onQueued: () => { queuedWhileSaving = true; },
  save: () => save()
});

async function loadShare(docUidValue: string) {
  const response = await getShareByDocApi(docUidValue);
  share.value = response.share;
  syncingShare = true;
  shareEnabled.value = !!share.value?.isEnabled || (!auth.isAdmin && share.value?.reviewStatus === "pending");
  shareCodeInput.value = share.value?.shareCode ? String(share.value.shareCode) : "";
  sharePassword.value = "";
  shareHasPassword.value = !!share.value?.hasPassword;
  shareStatus.value = shareReviewText.value || (shareHasPassword.value ? "当前已有密码，未确认新密码前不会改动" : "");
  syncingShare = false;
}

async function loadVersions(docUidValue: string) {
  const response = await listDocVersionsApi(docUidValue);
  versions.value = response.versions;
}

async function loadEditorList() {
  try {
    await docs.loadList();
  } catch {
    // The editor can still load the requested document if the side list fails.
  }
}

async function loadRelatedDocData(docUidValue: string) {
  const [shareResult, versionsResult] = await Promise.allSettled([loadShare(docUidValue), loadVersions(docUidValue)]);
  if (shareResult.status === "rejected") {
    share.value = null;
    shareStatus.value = "分享信息加载失败，可稍后重试。";
  }
  if (versionsResult.status === "rejected") {
    versions.value = [];
  }
}

async function load() {
  const requestedDocUid = docUid.value;
  share.value = null;
  sharePanelOpen.value = false;
  copied.value = false;
  toc.value = [];
  versions.value = [];
  mobileSheet.value = null;
  localDetailError.value = "";
  saveError.value = "";
  hydrating.value = true;
  void loadEditorList();
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
    await loadRelatedDocData(doc.docUid);
  } catch (error) {
    if (!isAbortError(error) && requestedDocUid === docUid.value) {
      localDetailError.value = normalizeError(error) || "文档详情加载失败，请稍后重试。";
    }
  } finally {
    if (requestedDocUid === docUid.value) hydrating.value = false;
  }
}

function retryLoadDetail() {
  void load();
}

async function createDoc() {
  const doc = await docs.createDoc("未命名文档");
  router.push(docPath(doc.docUid));
}

function selectDoc(uid: string) {
  router.push(docPath(uid));
}

function selectDocFromSheet(uid: string) {
  mobileSheet.value = null;
  selectDoc(uid);
}

function onEditorChange(payload: { contentJson: string; textLength: number }) {
  draft.value = payload;
  markDirty();
}

async function save() {
  if (!current.value || saving || !dirty.value) return;
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
    savedAt.value = new Date().toLocaleTimeString();
    if (current.value?.docUid === targetDocUid && title.value === titleSnapshot && draft.value === draftSnapshot) {
      draft.value = null;
      dirty.value = false;
      saveState.value = "saved";
      void removeLocalDraft(targetDocUid);
    } else if (current.value?.docUid === targetDocUid) {
      dirty.value = true;
      saveState.value = "pending";
    }
    void loadVersions(targetDocUid);
  } catch (error) {
    saveError.value = normalizeError(error) || "保存失败，请检查网络后重试。";
    dirty.value = true;
    saveState.value = "error";
  } finally {
    saving = false;
    const shouldDrainQueuedSave = queuedWhileSaving && saveState.value !== "error";
    queuedWhileSaving = false;
    if (shouldDrainQueuedSave && dirty.value) void save();
  }
}

function retrySave() {
  void save();
}

function waitForCurrentSave() {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (!saving) {
        resolve();
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}

async function flushPendingSave() {
  clearSaveTimer();
  if (saving) {
    queuedWhileSaving = true;
    await waitForCurrentSave();
  }
  if (dirty.value) await save();
}

async function ensureShare() {
  if (!current.value) return null;
  if (share.value) return share.value;
  const created = await createShareApi(current.value.docUid);
  share.value = created.share;
  return created.share;
}

async function saveShare(passwordConfirmed = false, clearPassword = false) {
  if (!current.value) return;
  shareLoading.value = true;
  try {
    const target = shareEnabled.value ? await ensureShare() : share.value;
    if (!target) return;
    const patch: SharePatch = {
      isEnabled: shareEnabled.value,
      expireAt: null
    };
    if (passwordConfirmed && sharePassword.value.trim()) patch.password = sharePassword.value.trim();
    if (clearPassword) patch.password = null;
    if (auth.isAdmin) {
      const shareCode = Number(shareCodeInput.value.trim());
      patch.shareCode = Number.isInteger(shareCode) && shareCode > 0 ? shareCode : null;
    }
    await updateShareApi(target.id, patch);
    const response = await getShareByDocApi(current.value.docUid);
    share.value = response.share;
    syncingShare = true;
    shareEnabled.value = !!share.value?.isEnabled || (!auth.isAdmin && share.value?.reviewStatus === "pending");
    shareCodeInput.value = share.value?.shareCode ? String(share.value.shareCode) : "";
    shareHasPassword.value = !!share.value?.hasPassword;
    sharePassword.value = "";
    syncingShare = false;
    if (!auth.isAdmin && share.value?.reviewStatus === "pending") {
      shareStatus.value = "已提交管理员审核，通过后才会公开。";
    } else {
      shareStatus.value = passwordConfirmed ? "密码已确认并更新" : "已自动更新，无访问密码";
    }
    void docs.loadList();
  } catch (error) {
    shareStatus.value = error instanceof Error ? error.message : "分享更新失败";
  } finally {
    shareLoading.value = false;
  }
}

function confirmSharePassword() {
  if (!sharePassword.value.trim()) {
    shareStatus.value = "密码为空，当前按无密码分享";
    void saveShare(false, true);
    return;
  }
  void saveShare(true);
}

function clearSharePassword() {
  sharePassword.value = "";
  void saveShare(false, true);
}

function onPasswordInput() {
  shareStatus.value = sharePassword.value.trim() ? "密码未确认，不会生效" : "未设置密码";
}

function scheduleShareSave() {
  if (hydrating.value || syncingShare || !current.value || (!share.value && !shareEnabled.value)) return;
  if (shareSaveTimer) window.clearTimeout(shareSaveTimer);
  shareStatus.value = "等待自动更新";
  shareSaveTimer = window.setTimeout(() => {
    void saveShare();
  }, 700);
}

async function copyShare() {
  if (!current.value) return;
  if (!shareEnabled.value) {
    shareStatus.value = "先开启公开分享，再复制链接。";
    sharePanelOpen.value = true;
    mobileSheet.value = "share";
    return;
  }
  if (!share.value) await saveShare();
  if (!shareUrl.value) {
    shareStatus.value = shareReviewText.value || "分享还未公开，暂时没有可复制链接。";
    return;
  }
  await navigator.clipboard.writeText(shareUrl.value);
  shareStatus.value = `已复制 ${shareUrl.value} · ${shareAccessText.value} · ${shareExpiryText.value}`;
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1600);
}

async function openVersionPreview(version: DocVersion) {
  if (!current.value) return;
  selectedVersion.value = version;
  versionPreviewLoading.value = true;
  try {
    versionPreview.value = (await getDocVersionPreviewApi(current.value.docUid, version.id)).version;
  } finally {
    versionPreviewLoading.value = false;
  }
}

async function restorePreviewedVersion() {
  if (!selectedVersion.value) return;
  await restoreVersion(selectedVersion.value);
  selectedVersion.value = null;
  versionPreview.value = null;
}

async function restorePreviewedVersionAsCopy() {
  if (!current.value || !selectedVersion.value) return;
  const restored = await restoreDocVersionAsCopyApi(current.value.docUid, selectedVersion.value.id);
  mobileSheet.value = null;
  router.push(docPath(restored.doc.docUid));
}

function resubmitRejectedShare() {
  shareEnabled.value = true;
  void saveShare();
}

async function restoreVersion(version: DocVersion) {
  if (!current.value) return;
  if (dirty.value || saving) {
    await flushPendingSave();
    if (dirty.value) {
      saveError.value = saveError.value || "当前内容还没有保存成功，保存后再恢复历史版本。";
      saveState.value = "error";
      return;
    }
  }
  await restoreDocVersionApi(current.value.docUid, version.id);
  await docs.loadDoc(current.value.docUid);
  const doc = docs.current;
  if (doc) title.value = doc.title;
  draft.value = null;
  dirty.value = false;
  saveState.value = "saved";
  editorRefresh.value += 1;
  await loadVersions(current.value.docUid);
}

async function restoreVersionFromSheet(version: DocVersion) {
  await openVersionPreview(version);
}

async function remove() {
  if (!current.value) return;
  await deleteDocApi(current.value.docUid);
  await docs.loadList();
  router.push(docsPath.value);
}

function openDesktopDelete(event: MouseEvent) {
  (event.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
  deleteOpen.value = true;
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  void persistLocalDraft();
  event.preventDefault();
  event.returnValue = "";
}

watch(() => route.params.docUid, load);
watch(() => route.fullPath, () => {
  mobileSheet.value = null;
});
watch(title, markDirty);
watch([shareEnabled, shareCodeInput], scheduleShareSave);

onMounted(() => {
  void load();
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", persistLocalDraft);
});

onBeforeRouteLeave(async (_to, _from, next) => {
  if (!dirty.value && !saving) {
    next();
    return;
  }
  const confirmed = await nativeConfirm({
    title: "离开编辑器",
    message: "当前文档还有未保存内容，确定保存后离开吗？",
    confirmText: "保存并离开"
  });
  if (confirmed) {
    await flushPendingSave();
    if (dirty.value) next(false);
    else next();
  } else {
    next(false);
  }
});

onBeforeUnmount(() => {
  clearSaveTimer();
  if (shareSaveTimer) window.clearTimeout(shareSaveTimer);
  if (localDraftTimer) window.clearTimeout(localDraftTimer);
  window.removeEventListener("beforeunload", beforeUnload);
  window.removeEventListener("pagehide", persistLocalDraft);
  if (dirty.value) void save();
});
</script>

<template>
  <section class="doc-editor-page" :class="{ 'is-mobile': isMobile }">
    <template v-if="isMobile">
      <header class="doc-editor-page__mobile-top">
        <button class="doc-editor-page__mobile-back" type="button" aria-label="返回文档列表" @click="router.push(docsPath)">
          <ArrowLeft :size="18" />
        </button>
        <div class="doc-editor-page__mobile-headline">
          <span>文档编辑</span>
          <strong>{{ title || "未命名文档" }}</strong>
        </div>
        <span class="doc-editor-page__mobile-save" :class="`is-${saveState}`">{{ saveText }}</span>
      </header>

      <div v-if="docs.loadingDetail && !current" class="doc-editor-page__loading is-mobile">
        <span class="cd-skeleton" />
        <span class="cd-skeleton" />
        <span class="cd-skeleton" />
      </div>

      <div v-else-if="detailErrorText" class="doc-editor-page__error is-mobile">
        <strong>文档详情加载失败</strong>
        <p>{{ detailErrorText }}</p>
        <button class="cd-button primary" type="button" @click="retryLoadDetail"><RefreshCw :size="16" />重试</button>
      </div>

      <template v-else-if="current">
        <section class="doc-editor-page__mobile-summary">
          <input v-model="title" class="doc-editor-page__mobile-title" aria-label="文档标题" />
          <div class="doc-editor-page__mobile-meta">
            <span>{{ mobileDocBadge }}</span>
            <span>{{ currentStatusText }}</span>
            <span>{{ documentWordCount }} 字</span>
          </div>
        </section>

        <div v-if="saveState === 'error'" class="doc-editor-page__save-error is-mobile">
          <span>{{ saveErrorText }}</span>
          <button class="cd-button primary" type="button" :disabled="!dirty" @click="retrySave">
            <RefreshCw :size="16" />重试保存
          </button>
        </div>

        <div class="doc-editor-page__mobile-actions">
          <button type="button" :disabled="saving || !dirty" @click="flushPendingSave">
            <Save :size="18" />
            <span>保存</span>
          </button>
          <button type="button" @click="mobileSheet = 'share'">
            <PanelRightOpen :size="18" />
            <span>分享</span>
          </button>
          <button type="button" @click="mobileSheet = 'more'">
            <MoreHorizontal :size="18" />
            <span>更多</span>
          </button>
        </div>

        <main class="doc-editor-page__mobile-canvas">
          <ChendocEditor
            :key="editorKey"
            :doc-uid="current.docUid"
            :content-json="current.contentJson"
            @change="onEditorChange"
            @toc="toc = $event"
          />
        </main>

        <button v-if="mobileSheet" class="doc-editor-page__mobile-sheet-scrim" type="button" aria-label="关闭面板" @click="mobileSheet = null" />

        <aside v-if="mobileSheet" class="doc-editor-page__mobile-sheet">
          <div class="doc-editor-page__mobile-sheet-handle" />
          <header class="doc-editor-page__mobile-sheet-head">
            <div>
              <small>{{ title || "未命名文档" }}</small>
              <strong>{{ mobileSheetTitle }}</strong>
            </div>
            <button type="button" aria-label="关闭面板" @click="mobileSheet = null">
              <X :size="18" />
            </button>
          </header>

          <div v-if="mobileSheet === 'docs'" class="doc-editor-page__mobile-docs">
            <button class="doc-editor-page__mobile-doc-item is-create" type="button" @click="createDoc">
              <BookOpen :size="17" />
              <span>新建文档</span>
            </button>
            <button
              v-for="doc in docs.docs"
              :key="doc.docUid"
              class="doc-editor-page__mobile-doc-item"
              :class="{ 'is-active': doc.docUid === docUid }"
              type="button"
              @click="selectDocFromSheet(doc.docUid)"
            >
              <strong>{{ doc.title }}</strong>
              <small>{{ new Date(doc.updatedAt).toLocaleString() }}</small>
            </button>
          </div>

          <div v-else-if="mobileSheet === 'toc'" class="doc-editor-page__mobile-list">
            <a v-for="item in toc" :key="item.id" :class="`is-h${item.level}`" :href="`#${item.id}`" @click="mobileSheet = null">
              {{ item.text }}
            </a>
            <p v-if="!toc.length" class="doc-editor-page__muted">暂无标题</p>
          </div>

          <div v-else-if="mobileSheet === 'share'" class="doc-editor-page__mobile-form">
            <DocEditorSharePanel
              v-model:share-enabled="shareEnabled"
              v-model:share-code-input="shareCodeInput"
              v-model:share-password="sharePassword"
              mobile
              :is-admin="auth.isAdmin"
              :share="share"
              :share-url="shareUrl"
              :share-loading="shareLoading"
              :share-has-password="shareHasPassword"
              :share-state-text="shareStateText"
              :share-access-text="shareAccessText"
              :share-expiry-text="shareExpiryText"
              :share-message="shareMessage"
              :share-status-is-error="shareStatusIsError"
              :share-review-text="shareReviewText"
              :copied="copied"
              @confirm-password="confirmSharePassword"
              @clear-password="clearSharePassword"
              @password-input="onPasswordInput"
              @copy="copyShare"
              @resubmit="resubmitRejectedShare"
            />
          </div>

          <div v-else-if="mobileSheet === 'versions'" class="doc-editor-page__versions is-mobile">
            <button v-for="version in versions" :key="version.id" type="button" @click="restoreVersionFromSheet(version)">
              <Eye :size="14" />
              <span>{{ version.title }}</span>
              <small>{{ version.wordCount }} 字 · {{ version.authorName }} · {{ formatDate(version.createdAt) }}</small>
              <small>{{ version.diffSummary }}</small>
            </button>
            <p v-if="!versions.length" class="doc-editor-page__muted">暂无版本</p>
            <div v-if="selectedVersion" class="doc-editor-page__version-preview">
              <strong>{{ selectedVersion.title }}</strong>
              <p v-if="versionPreviewLoading">正在加载预览…</p>
              <pre v-else>{{ versionPreview?.contentText || "此版本没有可预览文字。" }}</pre>
              <div class="doc-editor-page__version-actions">
                <button class="cd-button" type="button" :disabled="versionPreviewLoading" @click="restorePreviewedVersionAsCopy">恢复为副本</button>
                <button class="cd-button primary" type="button" :disabled="versionPreviewLoading" @click="restorePreviewedVersion">恢复此版本</button>
              </div>
            </div>
          </div>

          <div v-else-if="mobileSheet === 'more'" class="doc-editor-page__more-actions">
            <button class="cd-button" type="button" @click="mobileSheet = 'docs'"><BookOpen :size="16" />切换文档</button>
            <button class="cd-button" type="button" @click="mobileSheet = 'toc'"><Link2 :size="16" />目录导航</button>
            <button class="cd-button" type="button" @click="mobileSheet = 'versions'"><RotateCcw :size="16" />历史版本</button>
            <button class="cd-button" type="button" :disabled="shareLoading" @click="copyShare"><Copy :size="16" />{{ copied ? "已复制" : "复制分享信息" }}</button>
            <button class="cd-button danger" type="button" @click="deleteOpen = true"><Trash2 :size="16" />删除文档</button>
          </div>
        </aside>

        <ConfirmDialog
          v-model="deleteOpen"
          danger
          title="删除文档"
          message="文档会被软删除，R2 对象不会自动删除。确定删除吗？"
          confirm-text="删除"
          @confirm="remove"
        />
      </template>
    </template>

    <template v-else>
      <div v-if="showDesktopLeft" class="doc-editor-page__left" :class="{ 'is-toc-only': !showDesktopDocTree }">
        <DocTree v-if="showDesktopDocTree" :docs="docs.docs" :active-uid="docUid" :loading="docs.loadingList" @create="createDoc" @select="selectDoc" />
        <section class="doc-editor-page__left-toc">
          <h2>目录</h2>
          <div v-if="toc.length" class="doc-editor-page__toc">
            <a v-for="item in toc" :key="item.id" :class="`is-h${item.level}`" :href="`#${item.id}`">{{ item.text }}</a>
          </div>
          <p v-else class="doc-editor-page__muted">暂无标题</p>
        </section>
      </div>
      <main class="doc-editor-page__work">
        <div v-if="docs.loadingDetail && !current" class="doc-editor-page__loading">
          <span class="cd-skeleton" />
          <span class="cd-skeleton" />
          <span class="cd-skeleton" />
        </div>

        <div v-else-if="detailErrorText" class="doc-editor-page__error">
          <strong>文档详情加载失败</strong>
          <p>{{ detailErrorText }}</p>
          <button class="cd-button primary" type="button" @click="retryLoadDetail"><RefreshCw :size="16" />重试</button>
        </div>

        <template v-else-if="current">
          <header class="doc-editor-page__bar">
            <input v-model="title" class="doc-editor-page__title" aria-label="文档标题" />
            <span class="doc-editor-page__save" :class="`is-${saveState}`">{{ saveText }}</span>
            <span class="doc-editor-page__metrics">{{ documentWordCount }} 字</span>
            <button class="cd-button" :class="{ primary: sharePanelOpen }" type="button" @click="sharePanelOpen = !sharePanelOpen">
              <PanelRightOpen :size="16" />分享
            </button>
            <button class="cd-button" type="button" :disabled="shareLoading" @click="copyShare">
              <Copy :size="16" />{{ copied ? "已复制" : "复制链接" }}
            </button>
            <a v-if="shareCanOpenPublicly" class="cd-button" :href="shareUrl" target="_blank" rel="noopener noreferrer">
              <ExternalLink :size="16" />打开
            </a>
            <details class="doc-editor-page__desktop-more">
              <summary class="cd-button" role="button" aria-label="更多操作" title="更多操作">
                <MoreHorizontal :size="17" />更多
              </summary>
              <div class="doc-editor-page__desktop-menu">
                <button type="button" @click="openDesktopDelete">
                  <Trash2 :size="16" />删除文档
                </button>
              </div>
            </details>
          </header>

          <div v-if="saveState === 'error'" class="doc-editor-page__save-error">
            <span>{{ saveErrorText }}</span>
            <button class="cd-button primary" type="button" :disabled="!dirty" @click="retrySave">
              <RefreshCw :size="16" />重试保存
            </button>
          </div>

          <div class="doc-editor-page__body" :class="{ 'has-aside': sharePanelOpen }">
            <div class="doc-editor-page__canvas">
              <ChendocEditor
                :key="editorKey"
                :doc-uid="current.docUid"
                :content-json="current.contentJson"
                @change="onEditorChange"
                @toc="toc = $event"
              />
            </div>

            <aside v-if="sharePanelOpen" class="doc-editor-page__aside">
              <section>
                <h2>分享</h2>
                <DocEditorSharePanel
                  v-model:share-enabled="shareEnabled"
                  v-model:share-code-input="shareCodeInput"
                  v-model:share-password="sharePassword"
                  :is-admin="auth.isAdmin"
                  :share="share"
                  :share-url="shareUrl"
                  :share-loading="shareLoading"
                  :share-has-password="shareHasPassword"
                  :share-state-text="shareStateText"
                  :share-access-text="shareAccessText"
                  :share-expiry-text="shareExpiryText"
                  :share-message="shareMessage"
                  :share-status-is-error="shareStatusIsError"
                  :share-review-text="shareReviewText"
                  @confirm-password="confirmSharePassword"
                  @clear-password="clearSharePassword"
                  @password-input="onPasswordInput"
                  @resubmit="resubmitRejectedShare"
                />
              </section>

              <section>
                <h2>历史版本</h2>
                <div v-if="versions.length" class="doc-editor-page__versions">
                  <button v-for="version in versions" :key="version.id" type="button" @click="openVersionPreview(version)">
                    <Eye :size="14" />
                    <span>{{ version.title }}</span>
                    <small>{{ version.wordCount }} 字 · {{ version.authorName }} · {{ formatDate(version.createdAt) }}</small>
                    <small>{{ version.diffSummary }}</small>
                  </button>
                </div>
                <p v-else class="doc-editor-page__muted">暂无版本</p>
                <div v-if="selectedVersion" class="doc-editor-page__version-preview">
                  <strong>{{ selectedVersion.title }}</strong>
                  <p v-if="versionPreviewLoading">正在加载预览…</p>
                  <pre v-else>{{ versionPreview?.contentText || "此版本没有可预览文字。" }}</pre>
                  <div class="doc-editor-page__version-actions">
                    <button class="cd-button" type="button" :disabled="versionPreviewLoading" @click="restorePreviewedVersionAsCopy">恢复为副本</button>
                    <button class="cd-button primary" type="button" :disabled="versionPreviewLoading" @click="restorePreviewedVersion">恢复此版本</button>
                  </div>
                </div>
              </section>
            </aside>
          </div>

          <ConfirmDialog
            v-model="deleteOpen"
            danger
            title="删除文档"
            message="文档会被软删除，R2 对象不会自动删除。确定删除吗？"
            confirm-text="删除"
            @confirm="remove"
          />
        </template>
      </main>
    </template>
  </section>
</template>
