<script setup lang="ts">
import { Plus, Trash2 } from "lucide-vue-next";

defineProps<{
  bulkMode: boolean;
  selectedCount: number;
  visibleCount: number;
  bulkDeleting: boolean;
}>();

defineEmits<{
  bulkDelete: [];
  toggleAll: [];
  cancelBulk: [];
  create: [];
}>();
</script>

<template>
  <div class="doc-list-page__head">
    <div>
      <h1>收集表</h1>
      <p>创建表单，收集并管理提交记录。</p>
    </div>
    <div class="doc-list-page__actions">
      <span v-if="bulkMode && selectedCount" class="doc-list-page__bulk-counter">已选 {{ selectedCount }} 个</span>
      <button class="cd-button" type="button" :disabled="bulkMode && (!selectedCount || bulkDeleting)" @click="$emit('bulkDelete')">
        <Trash2 :size="16" />{{ bulkMode && selectedCount ? `批量删除 ${selectedCount}` : "批量操作" }}
      </button>
      <button v-if="bulkMode" class="cd-button" type="button" @click="$emit('toggleAll')">
        {{ selectedCount === visibleCount ? "取消全选" : "全选" }}
      </button>
      <button v-if="bulkMode" class="cd-button" type="button" @click="$emit('cancelBulk')">取消</button>
      <button class="cd-button primary" type="button" @click="$emit('create')"><Plus :size="16" />新建表单</button>
    </div>
  </div>
</template>
