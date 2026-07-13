<script setup lang="ts">
import { Filter, Search, Trash2 } from "lucide-vue-next";
import type { CommentFilterStatus } from "../../../features/comments";

const filterKeyword = defineModel<string>("filterKeyword", { required: true });
const filterDocUid = defineModel<string>("filterDocUid", { required: true });
const filterStatus = defineModel<CommentFilterStatus>("filterStatus", { required: true });
const showFilterPanel = defineModel<boolean>("showFilterPanel", { required: true });

defineProps<{
  selectedCount: number;
  hasActiveFilters: boolean;
}>();

defineEmits<{
  search: [];
  batchDelete: [];
}>();
</script>

<template>
  <div class="comment-manage__toolbar">
    <div class="comment-manage__search">
      <div class="cd-input-group">
        <input
          v-model="filterKeyword"
          type="text"
          class="cd-input"
          placeholder="搜索评论内容..."
          @keydown.enter="$emit('search')"
        />
        <button class="cd-button" type="button" @click="$emit('search')">
          <Search :size="16" />
        </button>
      </div>
      <input
        v-model="filterDocUid"
        type="text"
        class="cd-input"
        placeholder="文档 UID..."
        @keydown.enter="$emit('search')"
      />
      <select v-model="filterStatus" class="cd-select" @change="$emit('search')">
        <option value="">全部状态</option>
        <option value="active">正常</option>
        <option value="hidden">隐藏</option>
        <option value="deleted">已删除</option>
      </select>
      <button
        class="cd-button"
        type="button"
        :class="{ primary: hasActiveFilters }"
        @click="showFilterPanel = !showFilterPanel"
      >
        <Filter :size="16" />
      </button>
    </div>
    <div class="comment-manage__actions">
      <span v-if="selectedCount > 0" class="comment-manage__selected">
        已选 {{ selectedCount }} 条
      </span>
      <button
        v-if="selectedCount > 0"
        class="cd-button danger"
        type="button"
        @click="$emit('batchDelete')"
      >
        <Trash2 :size="16" />
        批量删除
      </button>
    </div>
  </div>
</template>
