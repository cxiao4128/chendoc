<script setup lang="ts">
import { Clock, RotateCcw, Trash2 } from "lucide-vue-next";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { useIsMobileViewport } from "../../composables/useViewport";
import TrashAside from "./components/TrashAside.vue";
import TrashStatsCards from "./components/TrashStatsCards.vue";
import TrashTable from "./components/TrashTable.vue";
import { useTrashPage } from "./hooks/useTrashPage";
import "./css/trash.css";

const isMobile = useIsMobileViewport();
const trash = useTrashPage();
</script>

<template>
  <section class="trash-page" :class="{ 'is-mobile': isMobile }">
    <div class="trash-page__head">
      <div>
        <h1>回收站</h1>
        <p>已删除内容保留 {{ trash.trashStats.value?.retentionDays || 7 }} 天，过期后自动永久清理。</p>
      </div>
      <div v-if="trash.filteredDocs.value.length" class="trash-page__head-actions">
        <button class="cd-button" type="button" :disabled="!trash.selectedCount.value || trash.operating.value" @click="trash.bulkRestoring.value = true">
          <RotateCcw :size="16" />批量恢复
        </button>
        <button class="cd-button danger" type="button" :disabled="!trash.selectedCount.value || trash.operating.value" @click="trash.bulkRemoving.value = true">
          <Trash2 :size="16" />批量永久删除
        </button>
      </div>
    </div>

    <TrashStatsCards
      v-if="trash.filteredDocs.value.length"
      :count="trash.filteredDocs.value.length"
      :recoverable-count="trash.recoverableCount.value"
      :release-size="trash.releaseSize.value"
    />

    <div class="trash-page__layout">
      <main class="trash-page__main">
        <div class="trash-page__toolbar">
          <div class="trash-page__filters">
            <button type="button" :class="{ 'is-active': trash.timeFilter.value === 'all' }" @click="trash.timeFilter.value = 'all'">全部</button>
            <button type="button" :class="{ 'is-active': trash.timeFilter.value === 'today' }" @click="trash.timeFilter.value = 'today'">今天删除</button>
            <button type="button" :class="{ 'is-active': trash.timeFilter.value === 'week' }" @click="trash.timeFilter.value = 'week'">7天内</button>
            <button type="button" :class="{ 'is-active': trash.timeFilter.value === 'month' }" @click="trash.timeFilter.value = 'month'">30天内</button>
          </div>
          <div class="trash-page__sort">
            <button class="cd-button" type="button" @click="trash.newestFirst.value = !trash.newestFirst.value">
              <Clock :size="15" />按删除时间（{{ trash.newestFirst.value ? "最新" : "最早" }}）
            </button>
          </div>
        </div>

        <TrashTable
          :docs="trash.filteredDocs.value"
          :loading="trash.loading.value"
          :has-more="trash.hasMore.value"
          :all-selected="trash.allSelected.value"
          :selected-doc-uids="trash.selectedDocUids.value"
          :operating="trash.operating.value"
          :format-date="trash.formatDate"
          :get-retention-days-left="trash.getRetentionDaysLeft"
          :get-retention-text="trash.getRetentionText"
          @toggle-all="trash.toggleAll"
          @toggle-selection="trash.toggleSelection"
          @restore="trash.restore"
          @request-remove="(doc) => { trash.removing.value = doc }"
          @load-more="trash.loadMore"
        />
      </main>

      <TrashAside
        :docs="trash.docs.value"
        :storage-percent="trash.storagePercent.value"
        :used-storage-text="trash.usedStorageText.value"
        :format-date="trash.formatDate"
      />
    </div>

    <ConfirmDialog
      :model-value="!!trash.removing.value"
      danger
      title="永久删除"
      :message="`确定永久删除「${trash.removing.value?.title || ''}」吗？这个操作不可恢复。`"
      confirm-text="永久删除"
      @update:model-value="(value) => { if (!value) trash.removing.value = null }"
      @confirm="trash.hardDelete"
    />
    <ConfirmDialog
      v-model="trash.bulkRestoring.value"
      title="批量恢复"
      :message="`确定恢复选中的 ${trash.selectedCount.value} 篇文档吗？`"
      confirm-text="恢复"
      @confirm="trash.bulkRestore"
    />
    <ConfirmDialog
      v-model="trash.bulkRemoving.value"
      danger
      title="批量永久删除"
      :message="`确定永久删除选中的 ${trash.selectedCount.value} 篇文档吗？这个操作不可恢复。`"
      confirm-text="永久删除"
      @confirm="trash.bulkHardDelete"
    />
  </section>
</template>
