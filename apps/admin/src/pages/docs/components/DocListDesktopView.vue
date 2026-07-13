<script setup lang="ts">
import {
  ArrowUpDown,
  FilePlus2,
  FileText,
  FolderPlus,
  Grid3X3,
  LayoutGrid,
  List,
  ListFilter,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  UploadCloud,
  X
} from "lucide-vue-next";
import EmptyState from "../../../components/common/EmptyState.vue";
import KanbanBoard from "../../../components/docs/KanbanBoard.vue";
import { useDocListContext } from "../docListContext";

const ctx = useDocListContext();

function setUploadInput(el: unknown) {
  ctx.uploadInput = el instanceof HTMLInputElement ? el : null;
}
</script>

<template>
  <div class="doc-list-page__head">
    <div>
      <h1>文档</h1>
      <p>{{ ctx.query ? `搜索：${ctx.query}` : "整理、检索、编辑和发布你的文档" }}</p>
    </div>
    <div class="doc-list-page__actions">
      <span v-if="ctx.bulkMode && ctx.selectedCount" class="doc-list-page__bulk-counter">已选 {{ ctx.selectedCount }} 篇</span>
      <button class="cd-button" type="button" :disabled="ctx.bulkMode && (!ctx.selectedCount || ctx.bulkDeleting)" @click="ctx.onBulkDeleteClick">
        <Trash2 :size="16" />{{ ctx.bulkMode && ctx.selectedCount ? `批量删除 ${ctx.selectedCount}` : "批量操作" }}
      </button>
      <button v-if="ctx.bulkMode" class="cd-button" type="button" @click="ctx.toggleAllVisibleDocs(ctx.visibleDocs)">
        {{ ctx.allVisibleSelected ? "取消全选" : "全选" }}
      </button>
      <button v-if="ctx.bulkMode" class="cd-button" type="button" @click="ctx.cancelBulkMode">取消</button>
      <button class="cd-button primary" type="button" @click="ctx.createNewDoc"><Plus :size="16" />新建文档</button>
    </div>
  </div>

  <div class="doc-list-page__filter-tabs" role="tablist" aria-label="文档视图">
    <button type="button" :class="{ 'is-active': ctx.viewFilter === 'all' }" role="tab" :aria-selected="ctx.viewFilter === 'all'" @click="ctx.viewFilter = 'all'">全部 <span>{{ ctx.totalCount }}</span></button>
    <button type="button" :class="{ 'is-active': ctx.viewFilter === 'published' }" role="tab" :aria-selected="ctx.viewFilter === 'published'" @click="ctx.viewFilter = 'published'">已发布 <span>{{ ctx.publishedCount }}</span></button>
    <button type="button" :class="{ 'is-active': ctx.viewFilter === 'draft' }" role="tab" :aria-selected="ctx.viewFilter === 'draft'" @click="ctx.viewFilter = 'draft'">草稿 <span>{{ ctx.draftCount }}</span></button>
    <button type="button" :class="{ 'is-active': ctx.viewFilter === 'review' }" role="tab" :aria-selected="ctx.viewFilter === 'review'" @click="ctx.viewFilter = 'review'">审批中 <span>{{ ctx.reviewCount }}</span></button>
    <button type="button" :class="{ 'is-active': ctx.viewFilter === 'shared' }" role="tab" :aria-selected="ctx.viewFilter === 'shared'" @click="ctx.viewFilter = 'shared'">已分享 <span>{{ ctx.sharedCount }}</span></button>
    <button type="button" :class="{ 'is-active': ctx.viewFilter === 'unshared' }" role="tab" :aria-selected="ctx.viewFilter === 'unshared'" @click="ctx.viewFilter = 'unshared'">未分享 <span>{{ ctx.unsharedCount }}</span></button>
    <button type="button" aria-label="新建文档" @click="ctx.createNewDoc"><Plus :size="15" /></button>
  </div>

  <div class="doc-list-page__workspace" :class="{ 'is-toolbox-collapsed': ctx.toolboxCollapsed }">
    <div class="doc-list-page__ledger">
      <div class="doc-list-page__table-tools">
        <button class="cd-button" type="button" @click="ctx.cycleSortMode"><ArrowUpDown :size="15" />{{ ctx.sortLabel }}</button>
        <select v-model="ctx.spaceFilter" class="cd-select" aria-label="按空间筛选">
          <option value="all">全部空间</option>
          <option value="none">未分空间</option>
          <option v-for="space in ctx.spaces" :key="space.id" :value="String(space.id)">{{ space.name }}</option>
        </select>
        <select v-model="ctx.tagFilter" class="cd-select" aria-label="按标签筛选">
          <option value="all">全部标签</option>
          <option v-for="tag in ctx.availableTags" :key="tag" :value="tag">{{ tag }}</option>
        </select>
        <select v-model="ctx.updatedFilter" class="cd-select" aria-label="按更新时间筛选">
          <option value="all">全部时间</option><option value="day">24 小时内</option><option value="week">7 天内</option><option value="month">30 天内</option>
        </select>
        <button class="cd-button" type="button" @click="ctx.resetFilters"><ListFilter :size="15" />重置筛选</button>
        <span class="doc-list-page__view-toggle">
          <button class="cd-button is-square" type="button" :class="{ 'is-active': ctx.viewMode === 'list' }" title="列表视图" aria-label="列表视图" data-view="list" @click="ctx.viewMode = 'list'"><List :size="15" /></button>
          <button class="cd-button is-square" type="button" :class="{ 'is-active': ctx.viewMode === 'kanban' }" title="看板视图" aria-label="看板视图" data-view="kanban" @click="ctx.viewMode = 'kanban'"><LayoutGrid :size="15" /></button>
        </span>
        <select v-if="ctx.viewMode === 'kanban'" v-model="ctx.kanbanGroupBy" class="cd-select" aria-label="看板分组">
          <option value="status">按状态</option>
          <option value="tag">按标签</option>
        </select>
        <button class="cd-button is-square" type="button" :class="{ 'is-active': ctx.compactMode && ctx.viewMode === 'list' }" aria-label="紧凑视图" @click="ctx.compactMode = !ctx.compactMode"><Grid3X3 :size="15" /></button>
        <button class="cd-button is-square" type="button" :aria-label="ctx.toolboxCollapsed ? '展开侧栏' : '折叠侧栏'" @click="ctx.toggleToolbox"><component :is="ctx.toolboxCollapsed ? PanelRightOpen : PanelRightClose" :size="16" /></button>
      </div>

      <div v-if="ctx.recentSearches.length" class="doc-list-page__recent-searches">
        <span>最近搜索</span>
        <button v-for="item in ctx.recentSearches" :key="item" type="button" @click="ctx.searchKeyword = item">{{ item }}</button>
      </div>

      <div v-if="ctx.loadingList" class="doc-list-page__skeleton">
        <span v-for="i in 6" :key="i" class="cd-skeleton" />
      </div>

      <div v-else-if="ctx.listErrorText" class="doc-list-page__error">
        <strong>文档列表加载失败</strong>
        <p>{{ ctx.listErrorText }}</p>
        <button class="cd-button primary" type="button" @click="ctx.retryLoad"><RefreshCw :size="16" />重试</button>
      </div>

      <EmptyState v-else-if="!ctx.visibleDocs.length" :title="ctx.query ? '没有找到文档' : '没有文档'">
        <template v-if="ctx.query">
          <p>没有找到包含「{{ ctx.query }}」的文档</p>
          <button class="cd-button" type="button" @click="ctx.searchKeyword = ''"><X :size="16" />清除搜索</button>
        </template>
        <template v-else>
          <button class="cd-button primary" type="button" @click="ctx.createNewDoc"><Plus :size="16" />新建文档</button>
        </template>
      </EmptyState>

      <div v-if="ctx.viewMode === 'list'" class="doc-list-page__table" :class="{ 'is-compact': ctx.compactMode, 'has-owner': ctx.showOwnerColumn }">
        <div class="doc-list-page__table-head" aria-hidden="true">
          <span></span><span>文档名称</span><span>状态</span><span v-if="ctx.showOwnerColumn">所有者</span><span>更新时间</span><span>分享</span><span>操作</span>
        </div>
        <article v-for="doc in ctx.visibleDocs" :key="doc.docUid" class="doc-list-page__row" :class="{ 'is-selected': ctx.selectedDocUids.has(doc.docUid) }" role="button" tabindex="0" @click="ctx.openOrToggleDoc(doc.docUid)" @keydown="ctx.handleRowKeydown($event, doc.docUid)">
          <label class="doc-list-page__select" @click.stop>
            <input :checked="ctx.selectedDocUids.has(doc.docUid)" type="checkbox" @change="ctx.toggleDocSelection(doc.docUid)" />
            <span></span>
          </label>
          <span class="doc-list-page__row-title">
            <i><FileText :size="17" /></i>
            <strong>{{ doc.title }}</strong>
            <small v-if="ctx.query && ctx.docPreviewText(doc)"><template v-for="(part, index) in ctx.docPreviewParts(doc)" :key="index"><mark v-if="part.highlighted">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></small>
            <small v-else>/ {{ doc.docUid }}</small>
          </span>
          <span>{{ ctx.statusText(doc.status) }}</span>
          <span v-if="ctx.showOwnerColumn" class="doc-list-page__owner"><img :src="ctx.logoUrl" alt="" loading="lazy" />{{ doc.ownerUsername || ctx.ownerName }}</span>
          <span>{{ ctx.formatDate(doc.updatedAt) }}</span>
          <code>{{ ctx.shareStatusText(doc) }}</code>
          <span class="doc-list-page__ops" @click.stop>
            <button type="button" :class="{ 'is-active': doc.pinned }" aria-label="收藏" @click="ctx.togglePinned(doc)"><Star :size="16" /></button>
            <button type="button" :aria-label="doc.shareCode ? '打开分享' : '创建分享'" @click="ctx.openShare(doc)"><MoreHorizontal :size="17" /></button>
          </span>
        </article>
      </div>

      <Transition name="view-switch" mode="out-in">
        <KanbanBoard v-if="ctx.viewMode === 'kanban'" :docs="ctx.visibleDocs" :group-by="ctx.kanbanGroupBy" :on-doc-click="ctx.openKanbanDoc" :on-doc-star="ctx.togglePinned" />
      </Transition>

      <button v-if="ctx.listHasMore" class="cd-button doc-list-page__more" type="button" :disabled="ctx.loadingList" @click="ctx.loadMore">
        {{ ctx.loadingList ? "加载中..." : "加载更多" }}
      </button>
    </div>

    <aside v-if="!ctx.toolboxCollapsed" class="doc-list-page__toolbox" aria-label="文档概览">
      <section v-if="ctx.auth.canAccessAdmin" class="doc-list-page__storage">
        <strong>存储概览</strong>
        <div class="doc-list-page__ring"><span>{{ ctx.storageFileCount }}</span></div>
        <p>{{ ctx.formatBytes(ctx.storageTotalBytes) }} · {{ ctx.storageFileCount }} 个上传记录</p>
        <RouterLink v-if="ctx.auth.canAccessAdmin" class="cd-button" to="/admin/settings/storage">管理存储</RouterLink>
      </section>
      <section>
        <strong>快捷操作</strong>
        <input :ref="setUploadInput" class="doc-list-page__file-input" type="file" @change="ctx.handleUpload" />
        <button class="doc-list-page__toolbox-action" type="button" :disabled="ctx.uploading" @click="ctx.triggerUpload"><UploadCloud :size="16" /><span>{{ ctx.uploading ? "导入中" : "导入附件文档" }}</span></button>
        <button class="doc-list-page__toolbox-action" type="button" @click="ctx.createFolder"><FolderPlus :size="16" /><span>新建空间</span></button>
        <button class="doc-list-page__toolbox-action" type="button" @click="ctx.createNewTemplateDoc"><FilePlus2 :size="16" /><span>从模板新建</span></button>
        <p v-if="ctx.actionMessage" class="doc-list-page__toolbox-message">{{ ctx.actionMessage }}</p>
      </section>
      <section>
        <strong>最近动态 <RouterLink :to="ctx.docsPath">查看全部</RouterLink></strong>
        <button v-for="log in ctx.recentActivity" :key="log.id" class="doc-list-page__activity" type="button" @click="ctx.openActivity(log)">
          <FileText :size="16" />
          <span><b>{{ ctx.activityText(log) }}</b><small>{{ log.targetId }} · {{ ctx.formatDate(log.createdAt) }}</small></span>
        </button>
        <p v-if="!ctx.recentActivity.length">暂无真实操作记录</p>
      </section>
    </aside>
  </div>
</template>
