<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";
import SyncIndicator from "../../../components/common/SyncIndicator.vue";
import type { SyncState } from "../../../composables/useSyncState";

defineProps<{
  title: string;
  saveText: string;
  saveState: "idle" | "pending" | "saving" | "saved" | "error";
  syncState: SyncState;
}>();

defineEmits<{
  back: [];
}>();
</script>

<template>
  <header class="doc-editor-mobile__top">
    <button
      class="doc-editor-mobile__back"
      type="button"
      aria-label="返回文档列表"
      @click="$emit('back')"
    >
      <ArrowLeft :size="18" />
    </button>
    <div class="doc-editor-mobile__headline">
      <span>文档编辑</span>
      <strong>{{ title || "未命名文档" }}</strong>
      <SyncIndicator :state="syncState" />
    </div>
    <span v-if="saveText" class="doc-editor-mobile__save" :class="`is-${saveState}`">
      {{ saveText }}
    </span>
  </header>
</template>
