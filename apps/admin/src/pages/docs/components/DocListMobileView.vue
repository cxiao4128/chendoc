<script setup lang="ts">
import { FileText, ListFilter, Plus, RefreshCw, Search, Trash2 } from "lucide-vue-next";
import EmptyState from "../../../components/common/EmptyState.vue";
import { useDocListContext } from "../docListContext";

const ctx = useDocListContext();
</script>

<template>
  <form class="doc-list-page__mobile-search" @submit.prevent="ctx.submitSearch">
    <Search :size="17" />
    <input v-model.trim="ctx.searchKeyword" aria-label="搜索文档" placeholder="搜索标题或输入分享路径" />
    <button type="submit">搜索</button>
  </form>

  <div class="doc-list-page__mobile-tabs" role="tablist" aria-label="移动端文档视图">
    <button type="button" :class="{ 'is-active': ctx.viewFilter === 'all' }" role="tab" :aria-selected="ctx.viewFilter === 'all'" @click="ctx.viewFilter = 'all'">最近</button>
    <button type="button" :class="{ 'is-active': ctx.viewFilter === 'published' }" role="tab" :aria-selected="ctx.viewFilter === 'published'" @click="ctx.viewFilter = 'published'">已发布</button>
    <button type="button" :class="{ 'is-active': ctx.viewFilter === 'shared' }" role="tab" :aria-selected="ctx.viewFilter === 'shared'" @click="ctx.viewFilter = 'shared'">已分享</button>
    <button type="button" :class="{ 'is-active': ctx.viewFilter === 'draft' }" role="tab" :aria-selected="ctx.viewFilter === 'draft'" @click="ctx.viewFilter = 'draft'">草稿</button>
    <button type="button" @click="ctx.resetFilters">筛选</button>
  </div>

  <div class="doc-list-page__mobile-actions">
    <button class="cd-button" type="button" :disabled="ctx.bulkMode && (!ctx.selectedCount || ctx.bulkDeleting)" @click="ctx.onBulkDeleteClick">
      <Trash2 v-if="ctx.bulkMode" :size="16" /><ListFilter v-else :size="16" />{{ ctx.bulkMode && ctx.selectedCount ? `批量删除 ${ctx.selectedCount}` : "选择文档" }}
    </button>
    <button v-if="ctx.bulkMode" class="cd-button" type="button" @click="ctx.toggleAllVisibleDocs(ctx.visibleDocs)">
      {{ ctx.allVisibleSelected ? "取消全选" : "全选" }}
    </button>
    <button v-if="ctx.bulkMode" class="cd-button" type="button" @click="ctx.cancelBulkMode">取消</button>
    <button class="cd-button primary" type="button" @click="ctx.createNewDoc"><Plus :size="16" />新建文档</button>
    <RouterLink class="cd-button" :to="ctx.trashPath"><Trash2 :size="16" />回收站</RouterLink>
  </div>

  <div v-if="ctx.loadingList" class="doc-list-page__skeleton is-mobile">
    <span v-for="i in 5" :key="i" class="cd-skeleton" />
  </div>

  <div v-else-if="ctx.listErrorText" class="doc-list-page__error is-mobile">
    <strong>文档列表加载失败</strong>
    <p>{{ ctx.listErrorText }}</p>
    <button class="cd-button primary" type="button" @click="ctx.retryLoad"><RefreshCw :size="16" />重试</button>
  </div>

  <EmptyState v-else-if="!ctx.visibleDocs.length" title="没有文档">
    <button class="cd-button primary" type="button" @click="ctx.createNewDoc"><Plus :size="16" />新建文档</button>
  </EmptyState>

  <div v-else class="doc-list-page__mobile-list">
    <article
      v-for="doc in ctx.visibleDocs"
      :key="doc.docUid"
      class="doc-list-page__mobile-card"
      :class="{ 'is-bulk': ctx.bulkMode, 'is-selected': ctx.selectedDocUids.has(doc.docUid) }"
      role="button"
      tabindex="0"
      @click="ctx.openOrToggleDoc(doc.docUid)"
      @keydown="ctx.handleRowKeydown($event, doc.docUid)"
    >
      <label v-if="ctx.bulkMode" class="doc-list-page__select" @click.stop>
        <input :checked="ctx.selectedDocUids.has(doc.docUid)" type="checkbox" @change="ctx.toggleDocSelection(doc.docUid)" />
        <span></span>
      </label>
      <div class="doc-list-page__mobile-row">
        <i><FileText :size="18" /></i>
        <div>
          <strong>{{ doc.title }}</strong>
          <p v-if="ctx.query && ctx.docPreviewText(doc)" class="doc-list-page__mobile-preview"><template v-for="(part, index) in ctx.docPreviewParts(doc)" :key="index"><mark v-if="part.highlighted">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></p>
          <p>{{ ctx.formatDate(doc.updatedAt) }}</p>
          <code>{{ ctx.shareStatusText(doc) }}</code>
        </div>
        <span>{{ ctx.statusText(doc.status) }}</span>
      </div>
    </article>
  </div>

  <button v-if="ctx.listHasMore" class="cd-button doc-list-page__more" type="button" :disabled="ctx.loadingList" @click="ctx.loadMore">
    {{ ctx.loadingList ? "加载中..." : "加载更多" }}
  </button>
</template>
