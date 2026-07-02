<script setup lang="ts">
/**
 * DocEditorMobile.vue - 移动端编辑视图
 *
 * 职责：
 * - 移动端完整视图
 * - 底部操作栏
 * - 滑动面板（文档切换/目录/分享/版本/更多）
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeft, BookOpen, Link2, PanelRightOpen, MoreHorizontal,
  Save, X
} from "lucide-vue-next";
import ConfirmDialog from "../../../components/common/ConfirmDialog.vue";
import DocTree from "../../../components/docs/DocTree.vue";
import SyncIndicator from "../../../components/common/SyncIndicator.vue";
import { useDocStore } from "../../../stores/doc";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";
import type { SyncState } from "../../../composables/useSyncState";
import type { DocDetail } from "../../../api/docs";

type MobileSheetType = "docs" | "toc" | "share" | "versions" | "more" | "export" | null;

const props = defineProps<{
  current: DocDetail | null;
  loading: boolean;
  error: string;
  title: string;
  saveState: "idle" | "pending" | "saving" | "saved" | "error";
  saveError: string;
  dirty: boolean;
  saving: boolean;
  wordCount: number;
  share: { isEnabled?: boolean; reviewStatus?: string } | null;
  shareUrl: string;
  shareEnabled: boolean;
  shareCodeInput: string;
  customSlugInput: string;
  sharePassword: string;
  shareLoading: boolean;
  shareHasPassword: boolean;
  shareStateText: string;
  shareAccessText: string;
  shareExpiryText: string;
  shareMessage: string;
  shareStatusIsError: boolean;
  shareReviewText: string;
  sharePanelOpen: boolean;
  versions: Array<{ id: number; title: string; wordCount: number; authorName: string; createdAt: string; diffSummary?: string }>;
  selectedVersion: { id: number; title: string; createdAt: string; wordCount: number; authorName: string; diffSummary?: string } | null;
  versionPreview: { contentText?: string } | null;
  versionPreviewLoading: boolean;
  syncState: {
    syncState: { value: SyncState };
  };
  docs: {
    docs: Array<{ docUid: string; title: string; updatedAt: string }>;
    loadingList: boolean;
  };
}>();

const emit = defineEmits<{
  (e: "update:title", value: string): void;
  (e: "update:mobileSheet", value: MobileSheetType): void;
  (e: "retry-load-detail"): void;
  (e: "editor-change", payload: { contentJson: string; textLength: number }): void;
  (e: "toc-update", toc: Array<{ id: string; text: string; level: 1 | 2 | 3 }>): void;
  (e: "flush-pending-save"): void;
  (e: "retry-save"): void;
  (e: "copy-share"): void;
  (e: "resubmit-share"): void;
  // 分享相关
  (e: "update:shareEnabled", value: boolean): void;
  (e: "update:sharePassword", value: string): void;
  (e: "update:customSlugInput", value: string): void;
  (e: "confirm-password"): void;
  (e: "clear-password"): void;
  (e: "password-input"): void;
  // 版本相关
  (e: "open-version-preview", version: { id: number; title: string; createdAt: string; wordCount: number; authorName: string; diffSummary?: string }): void;
  (e: "restore-version"): void;
  (e: "restore-version-as-copy"): void;
  // 定时相关
  (e: "open-schedule-panel"): void;
  // 文档操作
  (e: "create-doc"): void;
  (e: "delete-doc"): void;
}>();

const router = useRouter();
const docsStore = useDocStore();
const { docsPath, docPath } = useWorkspaceRoutes();

// 本地状态
const mobileSheet = ref<MobileSheetType>(null);
const deleteOpen = ref(false);
const toc = ref<Array<{ id: string; text: string; level: 1 | 2 | 3 }>>([]);
const editorKey = ref(0);

// 同步 mobileSheet
watch(mobileSheet, (v) => emit("update:mobileSheet", v));
watch(() => props.sharePanelOpen, (v) => {
  if (!v && mobileSheet.value === "share") mobileSheet.value = null;
});

const mobileSheetTitle = computed(() => {
  if (mobileSheet.value === "docs") return "切换文档";
  if (mobileSheet.value === "toc") return "目录导航";
  if (mobileSheet.value === "share") return "发布设置";
  if (mobileSheet.value === "versions") return "历史版本";
  if (mobileSheet.value === "more") return "更多操作";
  if (mobileSheet.value === "export") return "导出文档";
  return "";
});

const mobileDocBadge = computed(() => {
  if (props.share?.isEnabled) return "公开分享中";
  if (props.share?.reviewStatus === "pending") return "审核中";
  if (props.share?.reviewStatus === "rejected") return "审核未通过";
  return "当前仅内部可见";
});

const currentStatusText = computed(() => props.current?.status === "published" ? "已发布" : "草稿");

const saveText = computed(() => {
  if (props.saveState === "error") return "保存失败";
  return "";
});

const editorKeyComputed = computed(() => `${props.current?.docUid || "none"}-${editorKey.value}`);

function handleTitleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit("update:title", target.value);
}

function selectDoc(uid: string) {
  mobileSheet.value = null;
  router.push(docPath(uid));
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function handleTocUpdate(newToc: typeof toc.value) {
  toc.value = newToc;
  emit("toc-update", newToc);
}

function handleEditorChange(payload: { contentJson: string; textLength: number }) {
  emit("editor-change", payload);
}

// 分享相关
const shareEnabled = computed({
  get: () => props.shareEnabled,
  set: (v) => emit("update:shareEnabled", v)
});

const sharePassword = computed({
  get: () => props.sharePassword,
  set: (v) => emit("update:sharePassword", v)
});

const customSlugInput = computed({
  get: () => props.customSlugInput,
  set: (v) => emit("update:customSlugInput", v)
});
</script>

<template>
  <section class="doc-editor-mobile">
    <!-- 顶部栏 -->
    <header class="doc-editor-mobile__top">
      <button
        class="doc-editor-mobile__back"
        type="button"
        aria-label="返回文档列表"
        @click="router.push(docsPath)"
      >
        <ArrowLeft :size="18" />
      </button>
      <div class="doc-editor-mobile__headline">
        <span>文档编辑</span>
        <strong>{{ title || "未命名文档" }}</strong>
        <SyncIndicator :state="syncState.syncState.value" />
      </div>
      <span v-if="saveText" class="doc-editor-mobile__save" :class="`is-${saveState}`">
        {{ saveText }}
      </span>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading && !current" class="doc-editor-mobile__loading is-mobile">
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="doc-editor-mobile__error is-mobile">
      <strong>文档详情加载失败</strong>
      <p>{{ error }}</p>
      <button class="cd-button primary" type="button" @click="emit('retry-load-detail')">
        重试
      </button>
    </div>

    <!-- 文档内容 -->
    <template v-else-if="current">
      <!-- 摘要区 -->
      <section class="doc-editor-mobile__summary">
        <input
          :value="title"
          class="doc-editor-mobile__title"
          aria-label="文档标题"
          @input="handleTitleInput"
        />
        <div class="doc-editor-mobile__meta">
          <span>{{ mobileDocBadge }}</span>
          <span>{{ currentStatusText }}</span>
          <span>{{ wordCount }} 字</span>
        </div>
      </section>

      <!-- 保存错误 -->
      <div v-if="saveState === 'error'" class="doc-editor-mobile__save-error is-mobile">
        <span>{{ saveError }}</span>
        <button class="cd-button primary" type="button" :disabled="!dirty" @click="emit('retry-save')">
          重试保存
        </button>
      </div>

      <!-- 底部操作栏 -->
      <div class="doc-editor-mobile__actions">
        <button type="button" :disabled="saving || !dirty" @click="emit('flush-pending-save')">
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

      <!-- 编辑器画布 -->
      <main class="doc-editor-mobile__canvas">
        <slot name="editor" :editor-key="editorKeyComputed" @change="handleEditorChange" @toc="handleTocUpdate" />
      </main>

      <!-- 面板遮罩 -->
      <button
        v-if="mobileSheet"
        class="doc-editor-mobile__scrim"
        type="button"
        aria-label="关闭面板"
        @click="mobileSheet = null"
      />

      <!-- 底部面板 -->
      <aside v-if="mobileSheet" class="doc-editor-mobile__sheet">
        <div class="doc-editor-mobile__sheet-handle" />
        <header class="doc-editor-mobile__sheet-head">
          <div>
            <small>{{ title || "未命名文档" }}</small>
            <strong>{{ mobileSheetTitle }}</strong>
          </div>
          <button type="button" aria-label="关闭面板" @click="mobileSheet = null">
            <X :size="18" />
          </button>
        </header>

        <!-- 文档切换面板 -->
        <div v-if="mobileSheet === 'docs'" class="doc-editor-mobile__docs">
          <button class="doc-editor-mobile__doc-item is-create" type="button" @click="emit('create-doc')">
            <BookOpen :size="17" />
            <span>新建文档</span>
          </button>
          <button
            v-for="doc in docs.docs"
            :key="doc.docUid"
            class="doc-editor-mobile__doc-item"
            :class="{ 'is-active': doc.docUid === current.docUid }"
            type="button"
            @click="selectDoc(doc.docUid)"
          >
            <strong>{{ doc.title }}</strong>
            <small>{{ new Date(doc.updatedAt).toLocaleString() }}</small>
          </button>
        </div>

        <!-- 目录面板 -->
        <div v-else-if="mobileSheet === 'toc'" class="doc-editor-mobile__list">
          <a
            v-for="item in toc"
            :key="item.id"
            :class="`is-h${item.level}`"
            :href="`#${item.id}`"
            @click="mobileSheet = null"
          >
            {{ item.text }}
          </a>
          <p v-if="!toc.length" class="doc-editor-mobile__muted">暂无标题</p>
        </div>

        <!-- 分享面板 -->
        <div v-else-if="mobileSheet === 'share'" class="doc-editor-mobile__form">
          <slot name="share-panel-mobile" />
        </div>

        <!-- 版本历史面板 -->
        <div v-else-if="mobileSheet === 'versions'" class="doc-editor-mobile__versions is-mobile">
          <button
            v-for="version in versions"
            :key="version.id"
            type="button"
            @click="emit('open-version-preview', version)"
          >
            <span>{{ version.title }}</span>
            <small>{{ version.wordCount }} 字 · {{ version.authorName }} · {{ formatDate(version.createdAt) }}</small>
            <small>{{ version.diffSummary }}</small>
          </button>
          <p v-if="!versions.length" class="doc-editor-mobile__muted">暂无版本</p>

          <!-- 版本预览 -->
          <div v-if="selectedVersion" class="doc-editor-mobile__version-preview">
            <strong>{{ selectedVersion.title }}</strong>
            <p v-if="versionPreviewLoading">正在加载预览…</p>
            <pre v-else>{{ versionPreview?.contentText || "此版本没有可预览文字。" }}</pre>
            <div class="doc-editor-mobile__version-actions">
              <button class="cd-button" type="button" :disabled="versionPreviewLoading" @click="emit('restore-version-as-copy')">
                恢复为副本
              </button>
              <button class="cd-button primary" type="button" :disabled="versionPreviewLoading" @click="emit('restore-version')">
                恢复此版本
              </button>
            </div>
          </div>
        </div>

        <!-- 更多操作面板 -->
        <div v-else-if="mobileSheet === 'more'" class="doc-editor-mobile__more-actions">
          <button class="cd-button" type="button" @click="mobileSheet = 'docs'">
            <BookOpen :size="16" />
            切换文档
          </button>
          <button class="cd-button" type="button" @click="mobileSheet = 'toc'">
            <Link2 :size="16" />
            目录导航
          </button>
          <button class="cd-button" type="button" @click="mobileSheet = 'versions'">
            历史版本
          </button>
          <button class="cd-button" type="button" @click="emit('open-schedule-panel')">
            定时发布
          </button>
          <button class="cd-button danger" type="button" @click="deleteOpen = true">
            删除文档
          </button>
        </div>

        <!-- 导出面板 -->
        <div v-else-if="mobileSheet === 'export'" class="doc-editor-mobile__export">
          <slot name="export-menu" />
        </div>
      </aside>

      <!-- 删除确认 -->
      <ConfirmDialog
        v-model="deleteOpen"
        danger
        title="删除文档"
        message="文档会被软删除，R2 对象不会自动删除。确定删除吗？"
        confirm-text="删除"
        @confirm="emit('delete-doc')"
      />
    </template>
  </section>
</template>

<style scoped>
.doc-editor-mobile {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--cd-bg, #fff);
}

.doc-editor-mobile__top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cd-border-color, #e5e7eb);
  background: var(--cd-bg, #fff);
}

.doc-editor-mobile__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--cd-bg-secondary, #f3f4f6);
  border-radius: 8px;
  cursor: pointer;
  color: var(--cd-text, #374151);
}

.doc-editor-mobile__headline {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.doc-editor-mobile__headline > span:first-child {
  font-size: 12px;
  color: var(--cd-text-secondary, #6b7280);
}

.doc-editor-mobile__headline > strong {
  font-size: 16px;
  font-weight: 600;
  color: var(--cd-text, #374151);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-editor-mobile__save {
  font-size: 13px;
  color: var(--cd-error, #ef4444);
  white-space: nowrap;
}

.doc-editor-mobile__loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 16px;
}

.doc-editor-mobile__loading .cd-skeleton {
  height: 24px;
  border-radius: 4px;
}

.doc-editor-mobile__loading .cd-skeleton:nth-child(1) { width: 70%; }
.doc-editor-mobile__loading .cd-skeleton:nth-child(2) { width: 50%; }
.doc-editor-mobile__loading .cd-skeleton:nth-child(3) { width: 30%; }

.doc-editor-mobile__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 24px;
  text-align: center;
}

.doc-editor-mobile__error strong {
  font-size: 16px;
  color: var(--cd-error, #ef4444);
}

.doc-editor-mobile__error p {
  font-size: 14px;
  color: var(--cd-text-secondary, #6b7280);
  margin: 0;
}

.doc-editor-mobile__summary {
  padding: 16px;
  border-bottom: 1px solid var(--cd-border-color, #e5e7eb);
}

.doc-editor-mobile__title {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--cd-border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  background: var(--cd-bg, #fff);
}

.doc-editor-mobile__title:focus {
  outline: none;
  border-color: var(--cd-primary, #3b82f6);
}

.doc-editor-mobile__meta {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--cd-text-secondary, #6b7280);
}

.doc-editor-mobile__save-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.05);
  border-bottom: 1px solid var(--cd-border-color, #e5e7eb);
}

.doc-editor-mobile__save-error span {
  font-size: 13px;
  color: var(--cd-error, #ef4444);
}

.doc-editor-mobile__actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cd-border-color, #e5e7eb);
  background: var(--cd-bg, #fff);
}

.doc-editor-mobile__actions button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--cd-border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--cd-bg, #fff);
  font-size: 14px;
  color: var(--cd-text, #374151);
  cursor: pointer;
}

.doc-editor-mobile__actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.doc-editor-mobile__actions button:not(:disabled):hover {
  background: var(--cd-bg-secondary, #f3f4f6);
}

.doc-editor-mobile__canvas {
  flex: 1;
  overflow-y: auto;
}

.doc-editor-mobile__scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  border: none;
  cursor: pointer;
  z-index: 100;
}

.doc-editor-mobile__sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 70vh;
  background: var(--cd-bg, #fff);
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  z-index: 101;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.doc-editor-mobile__sheet-handle {
  width: 40px;
  height: 4px;
  background: var(--cd-border-color, #e5e7eb);
  border-radius: 2px;
  margin: 8px auto;
}

.doc-editor-mobile__sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cd-border-color, #e5e7eb);
}

.doc-editor-mobile__sheet-head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.doc-editor-mobile__sheet-head small {
  font-size: 12px;
  color: var(--cd-text-secondary, #6b7280);
}

.doc-editor-mobile__sheet-head strong {
  font-size: 16px;
  font-weight: 600;
  color: var(--cd-text, #374151);
}

.doc-editor-mobile__sheet-head button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: var(--cd-bg-secondary, #f3f4f6);
  border-radius: 50%;
  cursor: pointer;
  color: var(--cd-text-secondary, #6b7280);
}

.doc-editor-mobile__docs,
.doc-editor-mobile__list,
.doc-editor-mobile__form,
.doc-editor-mobile__versions,
.doc-editor-mobile__more-actions,
.doc-editor-mobile__export {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.doc-editor-mobile__doc-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--cd-border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--cd-bg, #fff);
  cursor: pointer;
  text-align: left;
  margin-bottom: 8px;
}

.doc-editor-mobile__doc-item.is-create {
  border-style: dashed;
  color: var(--cd-primary, #3b82f6);
  background: rgba(59, 130, 246, 0.05);
}

.doc-editor-mobile__doc-item.is-active {
  border-color: var(--cd-primary, #3b82f6);
  background: rgba(59, 130, 246, 0.05);
}

.doc-editor-mobile__doc-item strong {
  font-size: 14px;
  color: var(--cd-text, #374151);
}

.doc-editor-mobile__doc-item small {
  font-size: 12px;
  color: var(--cd-text-secondary, #6b7280);
}

.doc-editor-mobile__list a {
  display: block;
  padding: 8px 12px;
  color: var(--cd-text, #374151);
  text-decoration: none;
  border-radius: 4px;
}

.doc-editor-mobile__list a:hover {
  background: var(--cd-bg-secondary, #f3f4f6);
}

.doc-editor-mobile__list a.is-h2 { padding-left: 12px; font-weight: 500; }
.doc-editor-mobile__list a.is-h3 { padding-left: 24px; font-size: 13px; }

.doc-editor-mobile__muted {
  font-size: 13px;
  color: var(--cd-text-secondary, #6b7280);
  text-align: center;
  padding: 24px 0;
}

.doc-editor-mobile__more-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-editor-mobile__more-actions .cd-button {
  justify-content: flex-start;
}

.doc-editor-mobile__versions button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--cd-border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--cd-bg, #fff);
  cursor: pointer;
  text-align: left;
  margin-bottom: 8px;
}

.doc-editor-mobile__versions button span {
  font-size: 14px;
  font-weight: 500;
  color: var(--cd-text, #374151);
}

.doc-editor-mobile__versions button small {
  font-size: 12px;
  color: var(--cd-text-secondary, #6b7280);
}

.doc-editor-mobile__version-preview {
  margin-top: 16px;
  padding: 16px;
  background: var(--cd-bg-secondary, #f9fafb);
  border-radius: 8px;
}

.doc-editor-mobile__version-preview strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.doc-editor-mobile__version-preview pre {
  max-height: 150px;
  overflow-y: auto;
  font-size: 13px;
  background: var(--cd-bg, #fff);
  padding: 12px;
  border-radius: 4px;
  border: 1px solid var(--cd-border-color, #e5e7eb);
  white-space: pre-wrap;
}

.doc-editor-mobile__version-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.doc-editor-mobile__version-actions .cd-button {
  flex: 1;
}
</style>