<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { ArrowLeft, MoreHorizontal, Share2 } from "lucide-vue-next";

const props = defineProps<{
  title: string;
  saveState: string;
  saveError: string;
}>();

defineEmits<{
  back: [];
  share: [];
  more: [];
  retrySave: [];
}>();

const saveText = ref("");
let savedTimer: number | undefined;

function clearSavedTimer() {
  if (savedTimer) window.clearTimeout(savedTimer);
  savedTimer = undefined;
}

watch(() => props.saveState, (state, previous) => {
  clearSavedTimer();
  if (state === "pending") saveText.value = "待保存";
  else if (state === "saving") saveText.value = "保存中…";
  else if (state === "error") saveText.value = props.saveError || "保存失败";
  else if (previous === "pending" || previous === "saving") {
    saveText.value = "已保存";
    savedTimer = window.setTimeout(() => { saveText.value = ""; }, 1400);
  } else saveText.value = "";
}, { immediate: true });

watch(() => props.saveError, (message) => {
  if (props.saveState === "error") saveText.value = message || "保存失败";
});

onBeforeUnmount(clearSavedTimer);
</script>

<template>
  <header class="doc-editor-page__mobile-top">
    <button class="doc-editor-page__mobile-icon" type="button" aria-label="返回文档列表" @click="$emit('back')">
      <ArrowLeft :size="22" />
    </button>

    <div class="doc-editor-page__mobile-headline">
      <strong>{{ title || "未命名文档" }}</strong>
      <button
        v-if="saveText && saveState === 'error'"
        class="doc-editor-page__mobile-save is-error"
        type="button"
        :title="saveText"
        @click="$emit('retrySave')"
      >
        保存失败，点此重试
      </button>
      <span v-else-if="saveText" class="doc-editor-page__mobile-save" aria-live="polite">{{ saveText }}</span>
    </div>

    <button class="doc-editor-page__mobile-icon" type="button" aria-label="分享文档" @click="$emit('share')">
      <Share2 :size="20" />
    </button>
    <button class="doc-editor-page__mobile-icon" type="button" aria-label="更多操作" @click="$emit('more')">
      <MoreHorizontal :size="22" />
    </button>
  </header>
</template>
