<script setup lang="ts">
import { MoreHorizontal, PanelRightOpen, Save } from "lucide-vue-next";
import type { MobileSheetType } from "../../../features/editor";

const mobileSheet = defineModel<MobileSheetType>("mobileSheet", { required: true });

defineProps<{
  saving: boolean;
  dirty: boolean;
}>();

defineEmits<{
  save: [];
}>();
</script>

<template>
  <div class="doc-editor-mobile__actions">
    <button type="button" :disabled="saving || !dirty" @click="$emit('save')">
      <Save :size="18" />
      <span>保存</span>
    </button>
    <button type="button" @click="mobileSheet = 'share'">
      <PanelRightOpen :size="18" />
      <span>分享</span>
    </button>
    <button type="button" @click="mobileSheet = 'more'">
      <MoreHorizontal :size="18" />
      <span>更多</span>
    </button>
  </div>
</template>
