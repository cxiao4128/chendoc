<script setup lang="ts">
import { Clock, Save } from "lucide-vue-next";
import CommentPanel from "../../../components/comments/CommentPanel.vue";
import ConfirmDialog from "../../../components/common/ConfirmDialog.vue";
import DocTree from "../../../components/docs/DocTree.vue";
import ExportMenu from "../../../components/docs/ExportMenu.vue";
import DocEditorCanvas from "./DocEditorCanvas.vue";
import DocEditorSharePanel from "./DocEditorSharePanel.vue";
import DocVersionPanel from "./DocVersionPanel.vue";
import { useDocEditorPageContext } from "../docEditorPageContext";

const page = useDocEditorPageContext();
</script>

<template>
  <div v-if="page.showDesktopLeft" class="doc-editor-page__left" :class="{ 'is-toc-only': !page.showDesktopDocTree }">
    <DocTree
      v-if="page.showDesktopDocTree"
      :docs="page.ctx.docs?.docs"
      :active-uid="page.docUid"
      :loading="page.ctx.docs?.loadingList"
      @create="page.createDoc"
      @select="(uid) => page.router.push(page.docPath(uid))"
    />
    <section class="doc-editor-page__left-toc">
      <h2>目录</h2>
      <div v-if="page.toc?.length" class="doc-editor-page__toc">
        <a v-for="item in page.toc" :key="item.id" :class="`is-h${item.level}`" :href="`#${item.id}`">{{ item.text }}</a>
      </div>
      <p v-else class="doc-editor-page__muted">暂无标题</p>
    </section>
  </div>

  <main class="doc-editor-page__work">
    <div v-if="page.loading && !page.current" class="doc-editor-page__loading">
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
    </div>

    <div v-else-if="page.error" class="doc-editor-page__error">
      <strong>文档详情加载失败</strong>
      <p>{{ page.error }}</p>
      <button class="cd-button primary" type="button" @click="page.retryLoadDetail">重试</button>
    </div>

    <template v-else-if="page.current">
      <header class="doc-editor-page__bar">
        <input v-model="page.title" class="doc-editor-page__title" aria-label="文档标题" />
        <span class="doc-editor-page__metrics">{{ page.documentWordCount }} 字</span>
        <button class="cd-button" :class="{ primary: page.saveState === 'pending' || page.saveState === 'saving' }" type="button" :disabled="page.saveState === 'saving'" @click="page.flushPendingSave">
          <Save :size="16" />
          {{ page.saveState === 'saving' ? '保存中' : page.saveState === 'pending' ? '待保存' : page.saveState === 'error' ? '重试' : '已保存' }}
        </button>
        <span v-if="page.saveState === 'error'" class="doc-editor-page__save is-error">{{ page.saveError }}</span>

        <button class="cd-button" :class="{ primary: page.sharePanelOpen }" type="button" @click="page.sharePanelOpen = !page.sharePanelOpen">分享</button>
        <button class="cd-button" type="button" @click="page.copyShare">{{ page.copied ? '已复制' : '复制链接' }}</button>
        <button class="cd-button" :class="{ primary: page.commentPanelOpen }" type="button" @click="page.commentPanelOpen = !page.commentPanelOpen">评论</button>
        <button class="cd-button" type="button" @click="page.openSchedulePanel"><Clock :size="16" />定时</button>

        <details class="doc-editor-page__desktop-more">
          <summary class="cd-button" role="button" aria-label="更多操作" title="更多操作">更多</summary>
          <div class="doc-editor-page__desktop-menu">
            <button type="button" @click="page.exportMenuOpen = true">导出文档</button>
            <button type="button" @click="page.deleteOpen = true">删除文档</button>
          </div>
        </details>
      </header>

      <div v-if="page.saveState === 'error'" class="doc-editor-page__save-error">
        <span>{{ page.saveError }}</span>
        <button class="cd-button primary" type="button" @click="page.retrySave">重试保存</button>
      </div>

      <div class="doc-editor-page__body" :class="{ 'has-aside': page.sharePanelOpen || page.commentPanelOpen || page.schedulePanelOpen }">
        <div class="doc-editor-page__canvas">
          <DocEditorCanvas
            v-if="page.current"
            :key="page.editorKey"
            :doc-uid="page.current.docUid"
            :content-json="page.editorContentJson"
            @change="page.onEditorChange"
            @toc="(items) => { page.ctx.toc = items; }"
          />
        </div>

        <aside v-if="page.sharePanelOpen || page.commentPanelOpen || page.schedulePanelOpen" class="doc-editor-page__aside">
          <section v-if="page.sharePanelOpen">
            <h2>分享</h2>
            <DocEditorSharePanel
              v-model:share-enabled="page.shareEnabled"
              v-model:share-code-input="page.shareCodeInput"
              v-model:custom-slug-input="page.customSlugInput"
              v-model:share-password="page.sharePassword"
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
              @confirm-password="page.confirmSharePassword"
              @clear-password="page.clearSharePassword"
              @password-input="page.onPasswordInput"
              @save-custom-slug="page.saveCustomSlug"
              @resubmit="page.resubmitRejectedShare"
            />
          </section>

          <section v-if="page.commentPanelOpen">
            <CommentPanel :doc-uid="page.current.docUid" @close="page.commentPanelOpen = false" />
          </section>

          <section v-if="page.schedulePanelOpen">
            <h2><Clock :size="16" />定时发布</h2>
            <div v-if="page.scheduleLoading"><span class="cd-skeleton" /></div>
            <p v-else-if="page.scheduleError" class="doc-editor-page__error-text">{{ page.scheduleError }}</p>
            <div v-else class="doc-editor-page__schedule-form">
              <label class="doc-editor-page__schedule-field">
                <span>定时发布</span>
                <input type="datetime-local" class="cd-input" :value="page.scheduleData?.scheduledAt?.slice(0, 16) || ''" @change="(e) => page.saveSchedule({ scheduledAt: (e.target as HTMLInputElement).value ? new Date((e.target as HTMLInputElement).value).toISOString() : null })" />
              </label>
              <label class="doc-editor-page__schedule-field">
                <span>草稿过期</span>
                <input type="datetime-local" class="cd-input" :value="page.scheduleData?.expiresAt?.slice(0, 16) || ''" @change="(e) => page.saveSchedule({ expiresAt: (e.target as HTMLInputElement).value ? new Date((e.target as HTMLInputElement).value).toISOString() : null })" />
              </label>
              <div v-if="page.scheduleData?.scheduledAt || page.scheduleData?.expiresAt">
                <button class="cd-button danger" type="button" @click="page.clearSchedule">清除定时</button>
              </div>
            </div>
          </section>

          <section>
            <h2>历史版本</h2>
            <DocVersionPanel
              :versions="page.ctx.versions || []"
              :selected-version="page.selectedVersion ?? null"
              :version-preview="page.versionPreview ?? null"
              :version-preview-loading="page.versionPreviewLoading"
              @open-version-preview="page.openVersionPreview"
              @restore-version="page.restorePreviewedVersion"
              @restore-version-as-copy="page.restorePreviewedVersionAsCopy"
            />
          </section>
        </aside>
      </div>
    </template>
  </main>

  <ExportMenu v-if="page.exportMenuOpen && page.current" :doc-uid="page.current.docUid" :doc-title="page.current.title" @close="page.exportMenuOpen = false" />
  <ConfirmDialog v-model="page.deleteOpen" danger title="删除文档" message="文档会被软删除，R2 对象不会自动删除。确定删除吗？" confirm-text="删除" @confirm="page.remove" />
</template>
