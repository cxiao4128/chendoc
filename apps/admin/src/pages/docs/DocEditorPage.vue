<script setup lang="ts">
/**
 * DocEditorPage.vue - 文档编辑器主页面
 *
 * 重构说明：
 * - 本文件从 1062 行精简
 * - 核心逻辑在 DocEditorShell.vue 中通过单例共享上下文
 * - 上下文属性在脚本中解构为顶层变量，模板中自动解包
 */
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Clock } from "lucide-vue-next";
import DocTree from "../../components/docs/DocTree.vue";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import DocEditorSharePanel from "./components/DocEditorSharePanel.vue";
import ExportMenu from "../../components/docs/ExportMenu.vue";
import CommentPanel from "../../components/comments/CommentPanel.vue";
import DocEditorShell from "./components/DocEditorShell.vue";
import DocVersionPanel from "./components/DocVersionPanel.vue";
import DocSchedulePanel from "./components/DocSchedulePanel.vue";
import { useIsMobileViewport } from "../../composables/useViewport";
import { useWorkspaceRoutes } from "../../composables/useWorkspaceRoutes";
import { useDocEditorContext } from "../../composables/useDocEditorContext";
import { createShareApi, getShareByDocApi, updateShareApi, type SharePatch } from "../../api/shares";
import {
  getDocVersionPreviewApi, getDocScheduleApi, listDocVersionsApi,
  restoreDocVersionApi, deleteDocApi, setDocScheduleApi,
  deleteDocScheduleApi, restoreDocVersionAsCopyApi,
  type DocVersion
} from "../../api/docs";
import "./css/doc-editor.css";

// 获取共享上下文
const ctx = useDocEditorContext();

const route = useRoute();
const router = useRouter();
const isMobile = useIsMobileViewport();
const { docsPath, docPath } = useWorkspaceRoutes();

// 从上下文解构属性（模板中自动解包）
const {
  current, loading, error,
  title, saveState, saveError, documentWordCount,
  share, shareLoading, shareEnabled, sharePassword, shareCodeInput,
  customSlugInput, shareStatus, shareHasPassword,
  versions, selectedVersion, versionPreview, versionPreviewLoading,
  toc, showDesktopLeft, showDesktopDocTree,
  sync, onEditorChange, retryLoadDetail, flushPendingSave, retrySave,
  auth, docs
} = ctx;

// 面板状态
const sharePanelOpen = ref(false);
const commentPanelOpen = ref(false);
const schedulePanelOpen = ref(false);
const scheduleLoading = ref(false);
const scheduleError = ref("");
const scheduleData = ref<{ scheduledAt?: string | null; expiresAt?: string | null; autoArchive?: boolean } | null>(null);
const exportMenuOpen = ref(false);
const deleteOpen = ref(false);
const copied = ref(false);

// Computed
const docUid = computed(() => String(route.params.docUid || ""));
const shareUrl = computed(() => {
  if (!share.value?.isEnabled) return "";
  const shareKey = share.value.customSlug || share.value.shareCode;
  return `${location.origin}/r/${shareKey}`;
});
const shareCanOpenPublicly = computed(() => !!shareUrl.value);
const shareReviewText = computed(() => {
  if (!share.value?.reviewStatus || share.value.reviewStatus === "approved") return "";
  if (share.value.reviewStatus === "pending") return "等待管理员审核，通过后才会公开。";
  return share.value.reviewNote ? `审核未通过：${share.value.reviewNote}` : "审核未通过，可修改后重新提交。";
});
const shareStateText = computed(() => {
  if (!share.value) return current.value?.status === "published" ? "已发布 · 未公开" : "草稿";
  if (share.value.reviewStatus === "pending") return "已发布 → 待审核";
  if (share.value.reviewStatus === "rejected") return "已发布 → 已拒绝";
  if (share.value.isEnabled) return "已发布 → 已公开";
  return "已发布 → 已关闭";
});
const shareAccessText = computed(() => share.value?.isEnabled ? (shareHasPassword.value ? "持有链接和密码的人" : "持有链接的人") : "当前无人可访问");
const shareExpiryText = computed(() => share.value?.expireAt ? formatDate(share.value.expireAt) : "长期有效");
const shareMessage = computed(() => {
  if (shareLoading.value) return "自动更新中";
  return shareStatus.value || "修改后自动更新，密码需点确认才生效";
});
const shareStatusIsError = computed(() => shareStatus.value?.includes("失败") || shareStatus.value?.includes("占用") || shareStatus.value?.includes("保留"));

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

// 分享操作
async function saveShare(passwordConfirmed = false, clearPassword = false) {
  if (!current.value) return;
  shareLoading.value = true;
  try {
    let target = share.value;
    if (shareEnabled.value && !target) {
      const created = await createShareApi(current.value.docUid);
      target = created.share;
      share.value = target;
    }
    if (!target) return;
    const patch: SharePatch = { isEnabled: shareEnabled.value, expireAt: null };
    if (passwordConfirmed && sharePassword.value?.trim()) patch.password = sharePassword.value.trim();
    if (clearPassword) patch.password = null;
    if (customSlugInput.value?.trim()) patch.customSlug = customSlugInput.value.trim();
    await updateShareApi(target.id, patch);
    const response = await getShareByDocApi(current.value.docUid);
    share.value = response.share;
    shareEnabled.value = !!response.share?.isEnabled || (!auth?.isAdmin && response.share?.reviewStatus === "pending");
    shareCodeInput.value = response.share?.shareCode ? String(response.share.shareCode) : "";
    customSlugInput.value = response.share?.customSlug || "";
    shareHasPassword.value = !!response.share?.hasPassword;
    sharePassword.value = "";
    if (!auth?.isAdmin && response.share?.reviewStatus === "pending") {
      shareStatus.value = "已提交管理员审核，通过后才会公开。";
    } else {
      shareStatus.value = passwordConfirmed ? "密码已确认并更新" : "已自动更新，无访问密码";
    }
    docs?.loadList();
  } catch (error) {
    shareStatus.value = error instanceof Error ? error.message : "分享更新失败";
  } finally {
    shareLoading.value = false;
  }
}

function confirmSharePassword() {
  const pwd = sharePassword.value;
  if (!pwd?.trim()) {
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
  shareStatus.value = sharePassword.value?.trim() ? "密码未确认，不会生效" : "未设置密码";
}

async function copyShare() {
  if (!current.value) return;
  if (!shareEnabled.value) {
    shareStatus.value = "先开启公开分享，再复制链接。";
    sharePanelOpen.value = true;
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
  setTimeout(() => { copied.value = false; }, 1600);
}

function resubmitRejectedShare() {
  shareEnabled.value = true;
  void saveShare();
}

// 版本操作
async function openVersionPreview(version: DocVersion) {
  if (!current.value) return;
  selectedVersion.value = version;
  versionPreviewLoading.value = true;
  try {
    versionPreview.value = (await getDocVersionPreviewApi(current.value.docUid, version.id)).version;
  } catch {
    // ignore error
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
  router.push(docPath(restored.doc.docUid));
}

async function restoreVersion(version: DocVersion) {
  if (!current.value) return;
  if (ctx.dirty.value || saveState.value === "saving") {
    await flushPendingSave();
    if (ctx.dirty.value) {
      saveError.value = saveError.value || "当前内容还没有保存成功，保存后再恢复历史版本。";
      saveState.value = "error";
      return;
    }
  }
  await restoreDocVersionApi(current.value.docUid, version.id);
  await docs.loadDoc(current.value.docUid);
  const doc = docs.current;
  if (doc) {
    title.value = doc.title;
    ctx.draft.value = null;
    ctx.dirty.value = false;
    saveState.value = "saved";
  }
  const response = await listDocVersionsApi(current.value.docUid);
  versions.value = response.versions;
}

// 定时操作
async function loadSchedule() {
  if (!current.value) return;
  scheduleLoading.value = true;
  scheduleError.value = "";
  try {
    const res = await getDocScheduleApi(current.value.docUid);
    scheduleData.value = res.schedule;
  } catch (e: unknown) {
    scheduleError.value = e instanceof Error ? e.message : "加载定时设置失败";
  } finally {
    scheduleLoading.value = false;
  }
}

async function saveSchedule(input: { scheduledAt?: string | null; expiresAt?: string | null; autoArchive?: boolean }) {
  if (!current.value) return;
  scheduleLoading.value = true;
  scheduleError.value = "";
  try {
    const res = await setDocScheduleApi(current.value.docUid, input);
    scheduleData.value = res.schedule;
    schedulePanelOpen.value = false;
  } catch (e: unknown) {
    scheduleError.value = e instanceof Error ? e.message : "保存定时设置失败";
  } finally {
    scheduleLoading.value = false;
  }
}

async function clearSchedule() {
  if (!current.value) return;
  scheduleLoading.value = true;
  scheduleError.value = "";
  try {
    await deleteDocScheduleApi(current.value.docUid);
    scheduleData.value = null;
    schedulePanelOpen.value = false;
  } catch (e: unknown) {
    scheduleError.value = e instanceof Error ? e.message : "清除定时设置失败";
  } finally {
    scheduleLoading.value = false;
  }
}

function openSchedulePanel() {
  if (current.value) {
    void loadSchedule();
    schedulePanelOpen.value = true;
  }
}

// 文档操作
async function createDoc() {
  const doc = await docs.createDoc("未命名文档");
  router.push(docPath(doc.docUid));
}

async function remove() {
  if (!current.value) return;
  await deleteDocApi(current.value.docUid);
  await docs.loadList();
  router.push(docsPath.value);
}
</script>

<template>
  <section class="doc-editor-page" :class="{ 'is-mobile': isMobile }">
    <!-- Shell 提供上下文 -->
    <DocEditorShell />

    <!-- 移动端视图 -->
    <template v-if="isMobile">
      <div v-if="loading && !current" class="doc-editor-page__loading is-mobile">
        <span class="cd-skeleton" />
        <span class="cd-skeleton" />
        <span class="cd-skeleton" />
      </div>

      <div v-else-if="error" class="doc-editor-page__error is-mobile">
        <strong>文档详情加载失败</strong>
        <p>{{ error }}</p>
        <button class="cd-button primary" type="button" @click="retryLoadDetail">重试</button>
      </div>

      <template v-else-if="current">
        <header class="doc-editor-page__mobile-top">
          <button class="doc-editor-page__mobile-back" type="button" @click="router.push(docsPath)">←</button>
          <div class="doc-editor-page__mobile-headline">
            <span>文档编辑</span>
            <strong>{{ title || "未命名文档" }}</strong>
          </div>
          <span v-if="saveState === 'error'" class="doc-editor-page__mobile-save is-error">{{ saveError }}</span>
        </header>

        <section class="doc-editor-page__mobile-summary">
          <input v-model="title" class="doc-editor-page__mobile-title" aria-label="文档标题" />
          <div class="doc-editor-page__mobile-meta">
            <span>{{ current?.status === 'published' ? '已发布' : '草稿' }}</span>
            <span>{{ documentWordCount }} 字</span>
          </div>
        </section>

        <div v-if="saveState === 'error'" class="doc-editor-page__save-error is-mobile">
          <span>{{ saveError || "保存失败" }}</span>
          <button class="cd-button primary" type="button" @click="retrySave">重试保存</button>
        </div>

        <div class="doc-editor-page__mobile-actions">
          <button type="button" :disabled="saveState === 'saving' || !ctx.dirty.value" @click="flushPendingSave">
            保存
          </button>
          <button type="button" @click="sharePanelOpen = true">分享</button>
        </div>

        <main class="doc-editor-page__mobile-canvas">
          <slot name="editor" :doc-uid="current.docUid" :content-json="current.contentJson" @change="onEditorChange" />
        </main>

        <!-- 分享面板 -->
        <aside v-if="sharePanelOpen" class="doc-editor-page__mobile-sheet">
          <header class="doc-editor-page__mobile-sheet-head">
            <strong>发布设置</strong>
            <button type="button" @click="sharePanelOpen = false">✕</button>
          </header>
          <div class="doc-editor-page__mobile-sheet-content">
            <DocEditorSharePanel
              v-model:share-enabled="shareEnabled"
              v-model:share-code-input="shareCodeInput"
              v-model:custom-slug-input="customSlugInput"
              v-model:share-password="sharePassword"
              mobile
              :is-admin="auth?.isAdmin"
              :share="share.value"
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
        </aside>

        <ConfirmDialog v-model="deleteOpen" danger title="删除文档" message="确定删除吗？" confirm-text="删除" @confirm="remove" />
      </template>
    </template>

    <!-- 桌面端视图 -->
    <template v-else>
      <div v-if="showDesktopLeft" class="doc-editor-page__left" :class="{ 'is-toc-only': !showDesktopDocTree }">
        <DocTree
          v-if="showDesktopDocTree"
          :docs="docs.docs"
          :active-uid="docUid"
          :loading="docs.loadingList"
          @create="createDoc"
          @select="(uid) => router.push(docPath(uid))"
        />
        <section class="doc-editor-page__left-toc">
          <h2>目录</h2>
          <div v-if="toc?.length" class="doc-editor-page__toc">
            <a v-for="item in toc" :key="item.id" :class="`is-h${item.level}`" :href="`#${item.id}`">{{ item.text }}</a>
          </div>
          <p v-else class="doc-editor-page__muted">暂无标题</p>
        </section>
      </div>

      <main class="doc-editor-page__work">
        <div v-if="loading && !current" class="doc-editor-page__loading">
          <span class="cd-skeleton" />
          <span class="cd-skeleton" />
          <span class="cd-skeleton" />
        </div>

        <div v-else-if="error" class="doc-editor-page__error">
          <strong>文档详情加载失败</strong>
          <p>{{ error }}</p>
          <button class="cd-button primary" type="button" @click="retryLoadDetail">重试</button>
        </div>

        <template v-else-if="current">
          <!-- 工具栏 -->
          <header class="doc-editor-page__bar">
            <input v-model="title" class="doc-editor-page__title" aria-label="文档标题" />
            <span class="doc-editor-page__metrics">{{ documentWordCount }} 字</span>
            <span v-if="saveState === 'error'" class="doc-editor-page__save is-error">{{ saveError }}</span>

            <button class="cd-button" :class="{ primary: sharePanelOpen }" type="button" @click="sharePanelOpen = !sharePanelOpen">
              分享
            </button>
            <button class="cd-button" type="button" @click="copyShare">
              {{ copied ? '已复制' : '复制链接' }}
            </button>
            <button class="cd-button" :class="{ primary: commentPanelOpen }" type="button" @click="commentPanelOpen = !commentPanelOpen">
              评论
            </button>
            <button class="cd-button" type="button" @click="openSchedulePanel">
              <Clock :size="16" />定时
            </button>

            <details class="doc-editor-page__desktop-more">
              <summary class="cd-button">更多</summary>
              <div class="doc-editor-page__desktop-menu">
                <button type="button" @click="exportMenuOpen = true">导出文档</button>
                <button type="button" @click="deleteOpen = true">删除文档</button>
              </div>
            </details>
          </header>

          <!-- 保存错误 -->
          <div v-if="saveState === 'error'" class="doc-editor-page__save-error">
            <span>{{ saveError }}</span>
            <button class="cd-button primary" type="button" @click="retrySave">重试保存</button>
          </div>

          <!-- 主体 -->
          <div class="doc-editor-page__body" :class="{ 'has-aside': sharePanelOpen || commentPanelOpen || schedulePanelOpen }">
            <div class="doc-editor-page__canvas">
              <slot name="editor" :doc-uid="current.docUid" :content-json="current.contentJson" @change="onEditorChange" />
            </div>

            <aside v-if="sharePanelOpen || commentPanelOpen || schedulePanelOpen" class="doc-editor-page__aside">
              <section v-if="sharePanelOpen">
                <h2>分享</h2>
                <DocEditorSharePanel
                  v-model:share-enabled="shareEnabled"
                  v-model:share-code-input="shareCodeInput"
                  v-model:custom-slug-input="customSlugInput"
                  v-model:share-password="sharePassword"
                  :is-admin="auth?.isAdmin"
                  :share="share.value"
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

              <section v-if="commentPanelOpen">
                <CommentPanel :doc-uid="current.docUid" @close="commentPanelOpen = false" />
              </section>

              <section v-if="schedulePanelOpen">
                <h2><Clock :size="16" />定时发布</h2>
                <div v-if="scheduleLoading"><span class="cd-skeleton" /></div>
                <p v-else-if="scheduleError" class="doc-editor-page__error-text">{{ scheduleError }}</p>
                <div v-else class="doc-editor-page__schedule-form">
                  <label class="doc-editor-page__schedule-field">
                    <span>定时发布</span>
                    <input type="datetime-local" class="cd-input" :value="scheduleData?.scheduledAt?.slice(0, 16) || ''" @change="(e) => saveSchedule({ scheduledAt: (e.target as HTMLInputElement).value ? new Date((e.target as HTMLInputElement).value).toISOString() : null })" />
                  </label>
                  <label class="doc-editor-page__schedule-field">
                    <span>草稿过期</span>
                    <input type="datetime-local" class="cd-input" :value="scheduleData?.expiresAt?.slice(0, 16) || ''" @change="(e) => saveSchedule({ expiresAt: (e.target as HTMLInputElement).value ? new Date((e.target as HTMLInputElement).value).toISOString() : null })" />
                  </label>
                  <div v-if="scheduleData?.scheduledAt || scheduleData?.expiresAt">
                    <button class="cd-button danger" type="button" @click="clearSchedule">清除定时</button>
                  </div>
                </div>
              </section>

              <section>
                <h2>历史版本</h2>
                <DocVersionPanel
                  :versions="versions || []"
                  :selected-version="selectedVersion.value"
                  :version-preview="versionPreview.value"
                  :version-preview-loading="versionPreviewLoading"
                  @open-version-preview="openVersionPreview"
                  @restore-version="restorePreviewedVersion"
                  @restore-version-as-copy="restorePreviewedVersionAsCopy"
                />
              </section>
            </aside>
          </div>
        </template>
      </main>

      <ExportMenu v-if="exportMenuOpen && current" :doc-uid="current.docUid" :doc-title="current.title" @close="exportMenuOpen = false" />
      <ConfirmDialog v-model="deleteOpen" danger title="删除文档" message="文档会被软删除，R2 对象不会自动删除。确定删除吗？" confirm-text="删除" @confirm="remove" />
    </template>
  </section>
</template>
