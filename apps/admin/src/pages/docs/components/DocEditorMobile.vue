<script setup lang="ts">
import { computed, watch } from "vue";
import { useRouter } from "vue-router";
import ConfirmDialog from "../../../components/common/ConfirmDialog.vue";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";
import { useEditorMobile } from "../../../features/editor";
import type { TocItem } from "../../../features/editor";
import DocEditorMobileActions from "./DocEditorMobileActions.vue";
import DocEditorMobileSheet from "./DocEditorMobileSheet.vue";
import DocEditorMobileTop from "./DocEditorMobileTop.vue";
import type { DocEditorMobileEmits, DocEditorMobileProps } from "./DocEditorMobile.types";

const props = withDefaults(defineProps<DocEditorMobileProps>(), {
  loading: false,
  error: "",
  dirty: false,
  saving: false,
  wordCount: 0,
  share: null,
  sharePanelOpen: false,
  selectedVersion: null,
  versionPreview: null,
  versionPreviewLoading: false,
});

const emit = defineEmits<DocEditorMobileEmits>();
const router = useRouter();
const { docsPath, docPath } = useWorkspaceRoutes();
const {
  mobileSheet,
  deleteOpen,
  toc,
  mobileSheetTitle,
  mobileDocBadge,
  currentStatusText,
  editorKeyComputed,
  closeMobileSheet,
  handleTocUpdate,
} = useEditorMobile({
  share: () => props.share,
  currentStatus: () => props.current?.status,
});

watch(mobileSheet, (value) => emit("update:mobileSheet", value));

const saveText = computed(() => props.saveState === "error" ? "保存失败" : "");
const _shareEnabled = computed({
  get: () => props.shareEnabled,
  set: (v) => emit("update:shareEnabled", v),
});
const _sharePassword = computed({
  get: () => props.sharePassword,
  set: (v) => emit("update:sharePassword", v),
});

function handleTitleInput(event: Event) {
  emit("update:title", (event.target as HTMLInputElement).value);
}

function selectDoc(uid: string) {
  closeMobileSheet();
  router.push(docPath(uid));
}

function handleEditorChange(payload: { contentJson: string; textLength: number }) {
  emit("editor-change", payload);
}

function updateToc(nextToc: TocItem[]) {
  handleTocUpdate(nextToc);
  emit("toc-update", nextToc);
}
</script>

<template>
  <section class="doc-editor-mobile">
    <DocEditorMobileTop
      :title="title"
      :save-text="saveText"
      :save-state="saveState"
      :sync-state="syncState"
      @back="router.push(docsPath)"
    />

    <div v-if="loading && !current" class="doc-editor-mobile__loading is-mobile">
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
    </div>

    <div v-else-if="error" class="doc-editor-mobile__error is-mobile">
      <strong>文档详情加载失败</strong>
      <p>{{ error }}</p>
      <button class="cd-button primary" type="button" @click="emit('retry-load-detail')">
        重试
      </button>
    </div>

    <template v-else-if="current">
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

      <div v-if="saveState === 'error'" class="doc-editor-mobile__save-error is-mobile">
        <span>{{ saveError }}</span>
        <button class="cd-button primary" type="button" :disabled="!dirty" @click="emit('retry-save')">
          重试保存
        </button>
      </div>

      <DocEditorMobileActions
        v-model:mobile-sheet="mobileSheet"
        :saving="saving"
        :dirty="dirty"
        @save="emit('flush-pending-save')"
      />

      <main class="doc-editor-mobile__canvas">
        <slot
          name="editor"
          :editor-key="editorKeyComputed"
          :current="current"
          @change="handleEditorChange"
          @toc="updateToc"
        />
      </main>

      <DocEditorMobileSheet
        v-model:mobile-sheet="mobileSheet"
        v-model:delete-open="deleteOpen"
        :title="title"
        :current="current"
        :docs="docs"
        :toc="toc"
        :versions="versions"
        :selected-version="selectedVersion"
        :version-preview="versionPreview"
        :version-preview-loading="versionPreviewLoading"
        :mobile-sheet-title="mobileSheetTitle"
        @close="closeMobileSheet"
        @create-doc="emit('create-doc')"
        @select-doc="selectDoc"
        @open-version-preview="(version) => emit('open-version-preview', version)"
        @restore-version="emit('restore-version')"
        @restore-version-as-copy="emit('restore-version-as-copy')"
        @open-schedule-panel="emit('open-schedule-panel')"
      >
        <template #share-panel-mobile>
          <slot name="share-panel-mobile" />
        </template>
        <template #export-menu>
          <slot name="export-menu" />
        </template>
      </DocEditorMobileSheet>

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
</style>
