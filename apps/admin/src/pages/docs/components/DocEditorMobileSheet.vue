<script setup lang="ts">
import { BookOpen, Link2, X } from "lucide-vue-next";
import type { DocDetail, MobileSheetType, TocItem } from "../../../features/editor";

type MobileVersion = {
  id: number;
  title: string;
  wordCount: number;
  authorName: string;
  createdAt: string;
  diffSummary?: string;
};

const mobileSheet = defineModel<MobileSheetType>("mobileSheet", { required: true });
const deleteOpen = defineModel<boolean>("deleteOpen", { required: true });

defineProps<{
  title: string;
  current: DocDetail;
  docs: Array<{ docUid: string; title: string; updatedAt: string }>;
  toc: TocItem[];
  versions: MobileVersion[];
  selectedVersion: MobileVersion | null;
  versionPreview: { contentText?: string } | null;
  versionPreviewLoading: boolean;
  mobileSheetTitle: string;
}>();

defineEmits<{
  close: [];
  createDoc: [];
  selectDoc: [uid: string];
  openVersionPreview: [version: MobileVersion];
  restoreVersion: [];
  restoreVersionAsCopy: [];
  openSchedulePanel: [];
}>();

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
</script>

<template>
  <button
    v-if="mobileSheet"
    class="doc-editor-mobile__scrim"
    type="button"
    aria-label="关闭面板"
    @click="$emit('close')"
  />

  <aside
    v-if="mobileSheet"
    class="doc-editor-mobile__sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="doc-editor-mobile-sheet-title"
  >
    <div class="doc-editor-mobile__sheet-handle" />
    <header class="doc-editor-mobile__sheet-head">
      <div>
        <small>{{ title || "未命名文档" }}</small>
        <strong id="doc-editor-mobile-sheet-title">{{ mobileSheetTitle }}</strong>
      </div>
      <button type="button" aria-label="关闭面板" @click="$emit('close')">
        <X :size="18" />
      </button>
    </header>

    <div v-if="mobileSheet === 'docs'" class="doc-editor-mobile__docs">
      <button class="doc-editor-mobile__doc-item is-create" type="button" @click="$emit('createDoc')">
        <BookOpen :size="17" />
        <span>新建文档</span>
      </button>
      <button
        v-for="doc in docs"
        :key="doc.docUid"
        class="doc-editor-mobile__doc-item"
        :class="{ 'is-active': doc.docUid === current.docUid }"
        type="button"
        @click="$emit('selectDoc', doc.docUid)"
      >
        <strong>{{ doc.title }}</strong>
        <small>{{ new Date(doc.updatedAt).toLocaleString() }}</small>
      </button>
    </div>

    <div v-else-if="mobileSheet === 'toc'" class="doc-editor-mobile__list">
      <a
        v-for="item in toc"
        :key="item.id"
        :class="`is-h${item.level}`"
        :href="`#${item.id}`"
        @click="$emit('close')"
      >
        {{ item.text }}
      </a>
      <p v-if="!toc.length" class="doc-editor-mobile__muted">暂无标题</p>
    </div>

    <div v-else-if="mobileSheet === 'share'" class="doc-editor-mobile__form">
      <slot name="share-panel-mobile" />
    </div>

    <div v-else-if="mobileSheet === 'versions'" class="doc-editor-mobile__versions is-mobile">
      <button
        v-for="version in versions"
        :key="version.id"
        type="button"
        @click="$emit('openVersionPreview', version)"
      >
        <span>{{ version.title }}</span>
        <small>{{ version.wordCount }} 字 · {{ version.authorName }} · {{ formatDate(version.createdAt) }}</small>
        <small>{{ version.diffSummary }}</small>
      </button>
      <p v-if="!versions.length" class="doc-editor-mobile__muted">暂无版本</p>

      <div v-if="selectedVersion" class="doc-editor-mobile__version-preview">
        <strong>{{ selectedVersion.title }}</strong>
        <p v-if="versionPreviewLoading">正在加载预览...</p>
        <pre v-else>{{ versionPreview?.contentText || "此版本没有可预览文字。" }}</pre>
        <div class="doc-editor-mobile__version-actions">
          <button class="cd-button" type="button" :disabled="versionPreviewLoading" @click="$emit('restoreVersionAsCopy')">
            恢复为副本
          </button>
          <button class="cd-button primary" type="button" :disabled="versionPreviewLoading" @click="$emit('restoreVersion')">
            恢复此版本
          </button>
        </div>
      </div>
    </div>

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
      <button class="cd-button" type="button" @click="$emit('openSchedulePanel')">
        定时发布
      </button>
      <button class="cd-button danger" type="button" @click="deleteOpen = true">
        删除文档
      </button>
    </div>

    <div v-else-if="mobileSheet === 'export'" class="doc-editor-mobile__export">
      <slot name="export-menu" />
    </div>
  </aside>
</template>
