<script setup lang="ts">
import ConfirmDialog from "../../../components/common/ConfirmDialog.vue";
import DocEditorCanvas from "./DocEditorCanvas.vue";
import DocEditorSharePanel from "./DocEditorSharePanel.vue";
import { Save } from "lucide-vue-next";
import { useDocEditorPageContext } from "../docEditorPageContext";

const page = useDocEditorPageContext();
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
    <header class="doc-editor-page__mobile-top">
      <button class="doc-editor-page__mobile-back" type="button" @click="page.router.push(page.docsPath)">←</button>
      <div class="doc-editor-page__mobile-headline">
        <span>文档编辑</span>
        <strong>{{ page.title || "未命名文档" }}</strong>
      </div>
      <span v-if="page.saveState === 'error'" class="doc-editor-page__mobile-save is-error">{{ page.saveError }}</span>
    </header>

    <section class="doc-editor-page__mobile-summary">
      <input v-model="page.title" class="doc-editor-page__mobile-title" aria-label="文档标题" />
      <div class="doc-editor-page__mobile-meta">
        <span>{{ page.current?.status === 'published' ? '已发布' : '草稿' }}</span>
        <span>{{ page.documentWordCount }} 字</span>
      </div>
    </section>

    <div v-if="page.saveState === 'error'" class="doc-editor-page__save-error is-mobile">
      <span>{{ page.saveError || "保存失败" }}</span>
      <button class="cd-button primary" type="button" @click="page.retrySave">重试保存</button>
    </div>

    <div class="doc-editor-page__mobile-actions">
      <button type="button" :disabled="page.saveState === 'saving'" @click="page.flushPendingSave">
        <Save :size="16" />
        {{ page.saveState === 'saving' ? '保存中' : page.saveState === 'pending' ? '待保存' : page.saveState === 'error' ? '重试' : '已保存' }}
      </button>
      <button type="button" @click="page.sharePanelOpen = true">分享</button>
    </div>

    <main class="doc-editor-page__mobile-canvas">
      <DocEditorCanvas
        v-if="page.current"
        :key="page.editorKey"
        :doc-uid="page.current.docUid"
        :content-json="page.editorContentJson"
        @change="page.onEditorChange"
        @toc="(items) => { page.ctx.toc = items; }"
      />
    </main>

    <aside
      v-if="page.sharePanelOpen"
      class="doc-editor-page__mobile-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-editor-mobile-publish-title"
    >
      <header class="doc-editor-page__mobile-sheet-head">
        <strong id="doc-editor-mobile-publish-title">发布设置</strong>
        <button type="button" aria-label="关闭发布设置" @click="page.sharePanelOpen = false">✕</button>
      </header>
      <div class="doc-editor-page__mobile-sheet-content">
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
    </aside>

    <ConfirmDialog v-model="page.deleteOpen" danger title="删除文档" message="确定删除吗？" confirm-text="删除" @confirm="page.remove" />
  </template>
</template>
