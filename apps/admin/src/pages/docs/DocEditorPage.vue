<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { ArrowLeft, BookOpen, Copy, ExternalLink, Link2, PanelRightOpen, RefreshCw, RotateCcw, Trash2, X } from "lucide-vue-next";
import ChendocEditor from "../../components/editor/ChendocEditor.vue";
import DocTree from "../../components/docs/DocTree.vue";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { useIsMobileViewport } from "../../composables/useViewport";
import { deleteDocApi, listDocVersionsApi, restoreDocVersionApi, type DocVersion } from "../../api/docs";
import { createShareApi, getShareByDocApi, updateShareApi, type ShareItem, type SharePatch } from "../../api/shares";
import { useAuthStore } from "../../stores/auth";
import { useDocStore } from "../../stores/doc";
import "./doc-editor.css";

interface TocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

type DocStoreCompat = {
  detailError?: unknown;
};

const route = useRoute();
const router = useRouter();
const docs = useDocStore();
const auth = useAuthStore();
const isMobile = useIsMobileViewport();

const title = ref("");
const draft = ref<{ contentJson: string; contentHtml: string } | null>(null);
const saveState = ref<"idle" | "pending" | "saving" | "saved" | "error">("idle");
const savedAt = ref("");
const share = ref<ShareItem | null>(null);
const shareLoading = ref(false);
const copied = ref(false);
const deleteOpen = ref(false);
const hydrating = ref(false);
const dirty = ref(false);
const toc = ref<TocItem[]>([]);
const versions = ref<DocVersion[]>([]);
const editorRefresh = ref(0);
const shareEnabled = ref(false);
const sharePassword = ref("");
const shareSlug = ref("");
const shareCodeInput = ref("");
const shareStatus = ref("");
const shareHasPassword = ref(false);
const sharePanelOpen = ref(false);
const mobileSheet = ref<null | "docs" | "toc" | "share" | "versions">(null);
const localDetailError = ref("");
const saveError = ref("");
let saveTimer: number | undefined;
let shareSaveTimer: number | undefined;
let saving = false;
let queuedWhileSaving = false;
let syncingShare = false;

const AUTO_SAVE_DELAY_MS = 900;

const docId = computed(() => Number(route.params.id));
const current = computed(() => docs.current?.id === docId.value ? docs.current : null);
const editorKey = computed(() => `${current.value?.id || 0}-${editorRefresh.value}`);
const detailErrorText = computed(() => normalizeError((docs as unknown as DocStoreCompat).detailError) || localDetailError.value);
const saveErrorText = computed(() => saveError.value || "保存失败，当前编辑内容仍保留在本地。");
const shareUrl = computed(() => {
  if (!share.value?.isEnabled) return "";
  return `${location.origin}/r/${share.value.customSlug || share.value.shareCode}`;
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
const mobileSheetTitle = computed(() => {
  if (mobileSheet.value === "docs") return "切换文档";
  if (mobileSheet.value === "toc") return "目录导航";
  if (mobileSheet.value === "share") return "分享设置";
  if (mobileSheet.value === "versions") return "历史版本";
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

function normalizeError(error: unknown) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "value" in error) return normalizeError((error as { value: unknown }).value);
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return String((error as { message: string }).message);
  }
  return "操作失败，请稍后重试。";
}

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
}

function clearSaveTimer() {
  if (!saveTimer) return;
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
}

function scheduleSave() {
  clearSaveTimer();
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    if (saving) {
      queuedWhileSaving = true;
      return;
    }
    void save();
  }, AUTO_SAVE_DELAY_MS);
}

async function loadShare(docIdValue: number) {
  const response = await getShareByDocApi(docIdValue);
  share.value = response.share;
  syncingShare = true;
  shareEnabled.value = !!share.value?.isEnabled || (!auth.isAdmin && share.value?.reviewStatus === "pending");
  shareSlug.value = share.value?.customSlug || "";
  shareCodeInput.value = share.value?.shareCode ? String(share.value.shareCode) : "";
  sharePassword.value = "";
  shareHasPassword.value = !!share.value?.hasPassword;
  shareStatus.value = shareReviewText.value || (shareHasPassword.value ? "当前已有密码，未确认新密码前不会改动" : "");
  syncingShare = false;
}

async function loadVersions(docIdValue: number) {
  const response = await listDocVersionsApi(docIdValue);
  versions.value = response.versions;
}

async function loadEditorList() {
  try {
    await docs.loadList();
  } catch {
    // The editor can still load the requested document if the side list fails.
  }
}

async function loadRelatedDocData(docIdValue: number) {
  const [shareResult, versionsResult] = await Promise.allSettled([loadShare(docIdValue), loadVersions(docIdValue)]);
  if (shareResult.status === "rejected") {
    share.value = null;
    shareStatus.value = "分享信息加载失败，可稍后重试。";
  }
  if (versionsResult.status === "rejected") {
    versions.value = [];
  }
}

async function load() {
  const requestedDocId = docId.value;
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
    const doc = await docs.loadDoc(requestedDocId);
    if (requestedDocId !== docId.value) return;
    title.value = doc.title;
    draft.value = null;
    dirty.value = false;
    saveState.value = "idle";
    await loadRelatedDocData(doc.id);
  } catch (error) {
    if (!isAbortError(error) && requestedDocId === docId.value) {
      localDetailError.value = normalizeError(error) || "文档详情加载失败，请稍后重试。";
    }
  } finally {
    if (requestedDocId === docId.value) hydrating.value = false;
  }
}

function retryLoadDetail() {
  void load();
}

async function createDoc() {
  const doc = await docs.createDoc("未命名文档");
  router.push(`/admin/docs/${doc.id}`);
}

function selectDoc(id: number) {
  router.push(`/admin/docs/${id}`);
}

function selectDocFromSheet(id: number) {
  mobileSheet.value = null;
  selectDoc(id);
}

function onEditorChange(payload: { contentJson: string; contentHtml: string }) {
  draft.value = payload;
  markDirty();
}

async function save() {
  if (!current.value || saving || !dirty.value) return;
  const targetDocId = current.value.id;
  const titleSnapshot = title.value;
  const draftSnapshot = draft.value;
  saving = true;
  saveState.value = "saving";
  saveError.value = "";
  try {
    await docs.saveDoc(targetDocId, {
      title: titleSnapshot.trim() || "未命名文档",
      ...(draftSnapshot ?? {})
    });
    savedAt.value = new Date().toLocaleTimeString();
    if (current.value?.id === targetDocId && title.value === titleSnapshot && draft.value === draftSnapshot) {
      draft.value = null;
      dirty.value = false;
      saveState.value = "saved";
    } else if (current.value?.id === targetDocId) {
      dirty.value = true;
      saveState.value = "pending";
    }
    void loadVersions(targetDocId);
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
  const created = await createShareApi(current.value.id);
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
      patch.customSlug = shareSlug.value.trim() || null;
      const shareCode = Number(shareCodeInput.value.trim());
      patch.shareCode = Number.isInteger(shareCode) && shareCode > 0 ? shareCode : null;
    }
    await updateShareApi(target.id, patch);
    const response = await getShareByDocApi(current.value.id);
    share.value = response.share;
    syncingShare = true;
    shareEnabled.value = !!share.value?.isEnabled || (!auth.isAdmin && share.value?.reviewStatus === "pending");
    shareSlug.value = share.value?.customSlug || "";
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
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1600);
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
  await restoreDocVersionApi(current.value.id, version.id);
  await docs.loadDoc(current.value.id);
  const doc = docs.current;
  if (doc) title.value = doc.title;
  draft.value = null;
  dirty.value = false;
  saveState.value = "saved";
  editorRefresh.value += 1;
  await loadVersions(current.value.id);
}

async function restoreVersionFromSheet(version: DocVersion) {
  await restoreVersion(version);
  mobileSheet.value = null;
}

async function remove() {
  if (!current.value) return;
  await deleteDocApi(current.value.id);
  await docs.loadList();
  router.push("/admin/docs");
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = "";
}

watch(() => route.params.id, load);
watch(() => route.fullPath, () => {
  mobileSheet.value = null;
});
watch(title, markDirty);
watch([shareEnabled, shareSlug, shareCodeInput], scheduleShareSave);

onMounted(() => {
  void load();
  window.addEventListener("beforeunload", beforeUnload);
});

onBeforeRouteLeave(async (_to, _from, next) => {
  if (!dirty.value && !saving) {
    next();
    return;
  }
  if (window.confirm("当前文档还有未保存内容，确定离开吗？")) {
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
  window.removeEventListener("beforeunload", beforeUnload);
  if (dirty.value) void save();
});
</script>

<template>
  <section class="doc-editor-page" :class="{ 'is-mobile': isMobile }">
    <template v-if="isMobile">
      <header class="doc-editor-page__mobile-top">
        <button class="doc-editor-page__mobile-back" type="button" aria-label="返回文档列表" @click="router.push('/admin/docs')">
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
          </div>
        </section>

        <div v-if="saveState === 'error'" class="doc-editor-page__save-error is-mobile">
          <span>{{ saveErrorText }}</span>
          <button class="cd-button primary" type="button" :disabled="saveState === 'saving' || !dirty" @click="retrySave">
            <RefreshCw :size="16" />重试保存
          </button>
        </div>

        <div class="doc-editor-page__mobile-actions">
          <button type="button" @click="mobileSheet = 'docs'">
            <BookOpen :size="18" />
            <span>文档库</span>
          </button>
          <button type="button" @click="mobileSheet = 'toc'">
            <Link2 :size="18" />
            <span>目录</span>
          </button>
          <button type="button" @click="mobileSheet = 'share'">
            <PanelRightOpen :size="18" />
            <span>分享</span>
          </button>
          <button type="button" @click="mobileSheet = 'versions'">
            <RotateCcw :size="18" />
            <span>版本</span>
          </button>
          <button type="button" :disabled="shareLoading" @click="copyShare">
            <Copy :size="18" />
            <span>{{ copied ? "已复制" : "复制链接" }}</span>
          </button>
          <button class="is-danger" type="button" @click="deleteOpen = true">
            <Trash2 :size="18" />
            <span>删除</span>
          </button>
        </div>

        <main class="doc-editor-page__mobile-canvas">
          <ChendocEditor
            :key="editorKey"
            :doc-id="current.id"
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
              :key="doc.id"
              class="doc-editor-page__mobile-doc-item"
              :class="{ 'is-active': doc.id === docId }"
              type="button"
              @click="selectDocFromSheet(doc.id)"
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
            <label class="doc-editor-page__check">
              <input v-model="shareEnabled" type="checkbox" />
              <span>{{ auth.isAdmin ? "公开分享" : "申请公开分享" }}</span>
            </label>
            <label v-if="auth.isAdmin">
              <span>分享数字</span>
              <input v-model.trim="shareCodeInput" inputmode="numeric" placeholder="例如 12345678" />
            </label>
            <label v-if="auth.isAdmin">
              <span>自定义短链接</span>
              <input v-model.trim="shareSlug" placeholder="留空默认使用数字链接" />
            </label>
            <label>
              <span>访问密码</span>
              <div class="doc-editor-page__password-row">
                <input v-model="sharePassword" type="password" placeholder="不点确认就是无密码" @input="onPasswordInput" />
                <button class="cd-button" type="button" :disabled="shareLoading" @click="confirmSharePassword">确认密码</button>
              </div>
              <button v-if="shareHasPassword" class="doc-editor-page__text-button" type="button" :disabled="shareLoading" @click="clearSharePassword">
                清除当前访问密码
              </button>
            </label>
            <div v-if="shareUrl" class="doc-editor-page__share-card is-mobile">
              <span>分享链接</span>
              <a :href="shareUrl" target="_blank" rel="noopener noreferrer">
                <Link2 :size="14" />{{ shareUrl }}
              </a>
            </div>
            <div v-else-if="share?.shareCode" class="doc-editor-page__share-card is-mobile">
              <span>分享数字</span>
              <code>{{ share.shareCode }}</code>
            </div>
            <div v-if="shareUrl" class="doc-editor-page__mobile-share-actions">
              <button class="cd-button" type="button" :disabled="shareLoading" @click="copyShare">
                <Copy :size="16" />{{ copied ? "已复制" : "复制链接" }}
              </button>
              <a class="cd-button" :href="shareUrl" target="_blank" rel="noopener noreferrer">
                <ExternalLink :size="16" />打开分享页
              </a>
            </div>
            <p class="doc-editor-page__share-status" :class="{ 'is-error': shareStatusIsError }">
              {{ shareMessage }}
            </p>
            <p v-if="shareReviewText" class="doc-editor-page__share-status" :class="{ 'is-error': share?.reviewStatus === 'rejected' }">
              {{ shareReviewText }}
            </p>
          </div>

          <div v-else-if="mobileSheet === 'versions'" class="doc-editor-page__versions is-mobile">
            <button v-for="version in versions" :key="version.id" type="button" @click="restoreVersionFromSheet(version)">
              <RotateCcw :size="14" />
              <span>{{ version.title }}</span>
              <small>{{ formatDate(version.createdAt) }}</small>
            </button>
            <p v-if="!versions.length" class="doc-editor-page__muted">暂无版本</p>
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
      <div class="doc-editor-page__left">
        <DocTree :docs="docs.docs" :active-id="docId" :loading="docs.loadingList" @create="createDoc" @select="selectDoc" />
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
            <button class="cd-button" :class="{ primary: sharePanelOpen }" type="button" @click="sharePanelOpen = !sharePanelOpen">
              <PanelRightOpen :size="16" />分享设置
            </button>
            <button class="cd-button" type="button" :disabled="shareLoading" @click="copyShare">
              <Copy :size="16" />{{ copied ? "已复制" : "复制链接" }}
            </button>
            <a v-if="shareCanOpenPublicly" class="cd-button" :href="shareUrl" target="_blank" rel="noopener noreferrer">
              <ExternalLink :size="16" />打开
            </a>
            <button class="cd-button danger" type="button" @click="deleteOpen = true">
              <Trash2 :size="16" />删除
            </button>
          </header>

          <div v-if="saveState === 'error'" class="doc-editor-page__save-error">
            <span>{{ saveErrorText }}</span>
            <button class="cd-button primary" type="button" :disabled="saveState === 'saving' || !dirty" @click="retrySave">
              <RefreshCw :size="16" />重试保存
            </button>
          </div>

          <div class="doc-editor-page__body" :class="{ 'has-aside': sharePanelOpen }">
            <div class="doc-editor-page__canvas">
              <ChendocEditor
                :key="editorKey"
                :doc-id="current.id"
                :content-json="current.contentJson"
                @change="onEditorChange"
                @toc="toc = $event"
              />
            </div>

            <aside v-if="sharePanelOpen" class="doc-editor-page__aside">
              <section>
                <h2>分享</h2>
                <label class="doc-editor-page__check">
                  <input v-model="shareEnabled" type="checkbox" />
                  <span>{{ auth.isAdmin ? "公开分享" : "申请公开分享" }}</span>
                </label>
                <label v-if="auth.isAdmin">
                  <span>分享数字</span>
                  <input v-model.trim="shareCodeInput" inputmode="numeric" placeholder="例如 12345678" />
                </label>
                <label v-if="auth.isAdmin">
                  <span>自定义短链接</span>
                  <input v-model.trim="shareSlug" placeholder="留空默认使用数字链接" />
                </label>
                <label>
                  <span>访问密码</span>
                  <div class="doc-editor-page__password-row">
                    <input v-model="sharePassword" type="password" placeholder="不点确认就是无密码" @input="onPasswordInput" />
                    <button class="cd-button" type="button" :disabled="shareLoading" @click="confirmSharePassword">确认密码</button>
                  </div>
                  <button v-if="shareHasPassword" class="doc-editor-page__text-button" type="button" :disabled="shareLoading" @click="clearSharePassword">
                    清除当前访问密码
                  </button>
                </label>
                <div v-if="shareUrl" class="doc-editor-page__share-card">
                  <span>分享链接</span>
                  <a :href="shareUrl" target="_blank" rel="noopener noreferrer">
                    <Link2 :size="14" />{{ shareUrl }}
                  </a>
                </div>
                <div v-else-if="share?.shareCode" class="doc-editor-page__share-card">
                  <span>分享数字</span>
                  <code>{{ share.shareCode }}</code>
                </div>
                <p class="doc-editor-page__share-status" :class="{ 'is-error': shareStatusIsError }">
                  {{ shareMessage }}
                </p>
                <p v-if="shareReviewText" class="doc-editor-page__share-status" :class="{ 'is-error': share?.reviewStatus === 'rejected' }">
                  {{ shareReviewText }}
                </p>
              </section>

              <section>
                <h2>历史版本</h2>
                <div v-if="versions.length" class="doc-editor-page__versions">
                  <button v-for="version in versions" :key="version.id" type="button" @click="restoreVersion(version)">
                    <RotateCcw :size="14" />
                    <span>{{ version.title }}</span>
                    <small>{{ formatDate(version.createdAt) }}</small>
                  </button>
                </div>
                <p v-else class="doc-editor-page__muted">暂无版本</p>
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
