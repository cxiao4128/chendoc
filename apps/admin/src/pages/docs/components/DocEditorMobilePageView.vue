<script setup lang="ts">
import { ref, watch } from "vue";
import { Copy, Download, Save, Settings2, Trash2 } from "lucide-vue-next";
import ConfirmDialog from "../../../components/common/ConfirmDialog.vue";
import ExportMenu from "../../../components/docs/ExportMenu.vue";
import DocEditorCanvas from "./DocEditorCanvas.vue";
import DocEditorMobileSheet from "./DocEditorMobileSheet.vue";
import DocEditorMobileTop from "./DocEditorMobileTop.vue";
import DocEditorSharePanel from "./DocEditorSharePanel.vue";
import { useDocEditorPageContext } from "../docEditorPageContext";

type MobilePagePanel = "share" | "more" | null;

const page = useDocEditorPageContext();
const panel = ref<MobilePagePanel>(null);

function openShare() {
  page.sharePanelOpen = true;
  panel.value = "share";
}

function openMore() {
  page.sharePanelOpen = false;
  panel.value = "more";
}

function closePanel() {
  if (panel.value === "share") page.sharePanelOpen = false;
  panel.value = null;
}

function openExport() {
  closePanel();
  page.exportMenuOpen = true;
}

function openDelete() {
  closePanel();
  page.deleteOpen = true;
}

watch(() => page.docUid, closePanel);
</script>

<template>
  <div v-if="page.loading && !page.current" class="doc-editor-page__loading is-mobile">
    <span class="cd-skeleton" />
    <span class="cd-skeleton" />
    <span class="cd-skeleton" />
  </div>

  <div v-else-if="page.error" class="doc-editor-page__error is-mobile">
    <strong>文档详情加载失败</strong>
    <p>{{ page.error }}</p>
    <button class="cd-button primary" type="button" @click="page.retryLoadDetail">重试</button>
  </div>

  <template v-else-if="page.current">
    <DocEditorMobileTop
      :title="page.title"
      :save-state="page.saveState"
      :save-error="page.saveError"
      @back="page.router.push(page.docsPath)"
      @share="openShare"
      @more="openMore"
      @retry-save="page.retrySave"
    />

    <section class="doc-editor-page__mobile-document">
      <input
        v-model="page.title"
        class="doc-editor-page__mobile-title"
        aria-label="文档标题"
        placeholder="请输入标题"
      />
      <main class="doc-editor-page__mobile-canvas">
        <DocEditorCanvas
          :key="page.editorKey"
          :doc-uid="page.current.docUid"
          :content-json="page.editorContentJson"
          @change="page.onEditorChange"
          @toc="(items) => { page.ctx.toc = items; }"
        />
      </main>
    </section>

    <DocEditorMobileSheet :panel="panel" :title="page.title" @close="closePanel">
      <template #share>
        <div class="doc-editor-page__mobile-form">
          <DocEditorSharePanel
            v-model:share-enabled="page.shareEnabled"
            v-model:share-code-input="page.shareCodeInput"
            v-model:custom-slug-input="page.customSlugInput"
            v-model:share-password="page.sharePassword"
            mobile
            :is-admin="page.ctx.auth?.isAdmin ?? false"
            :share="page.share ?? null"
            :share-url="page.shareUrl"
            :share-loading="page.shareLoading"
            :share-has-password="page.shareHasPassword"
            :share-state-text="page.shareStateText"
            :share-access-text="page.shareAccessText"
            :share-expiry-text="page.shareExpiryText"
            :share-message="page.shareMessage"
            :share-status-is-error="page.shareStatusIsError"
            :share-review-text="page.shareReviewText"
            :copied="page.copied"
            @confirm-password="page.confirmSharePassword"
            @clear-password="page.clearSharePassword"
            @password-input="page.onPasswordInput"
            @save-custom-slug="page.saveCustomSlug"
            @copy="page.copyShare"
            @resubmit="page.resubmitRejectedShare"
          />
        </div>
      </template>

      <template #more>
        <div class="doc-editor-page__mobile-more-actions">
          <button type="button" :disabled="page.saveState === 'saving'" @click="page.flushPendingSave">
            <Save :size="20" /><span>立即保存</span>
          </button>
          <button type="button" @click="openShare">
            <Settings2 :size="20" /><span>分享设置</span>
          </button>
          <button type="button" :disabled="!page.shareUrl" @click="page.copyShare">
            <Copy :size="20" /><span>{{ page.copied ? "已复制链接" : "复制分享链接" }}</span>
          </button>
          <button type="button" @click="openExport">
            <Download :size="20" /><span>导出文档</span>
          </button>
          <button class="is-danger" type="button" @click="openDelete">
            <Trash2 :size="20" /><span>删除文档</span>
          </button>
        </div>
      </template>
    </DocEditorMobileSheet>

    <ExportMenu
      v-if="page.exportMenuOpen"
      :doc-uid="page.current.docUid"
      :doc-title="page.current.title"
      @close="page.exportMenuOpen = false"
    />
    <ConfirmDialog
      v-model="page.deleteOpen"
      danger
      title="删除文档"
      message="文档会移到回收站，确定删除吗？"
      confirm-text="删除"
      @confirm="page.remove"
    />
  </template>
</template>
