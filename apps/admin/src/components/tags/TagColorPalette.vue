<script setup lang="ts">
import { TAG_COLORS } from "@/services/api";

defineProps<{
  modelValue: string;
}>();

defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<template>
  <div class="tag-manager__colors">
    <button
      v-for="color in TAG_COLORS"
      :key="color"
      class="tag-manager__color"
      :class="{ active: modelValue === color }"
      :style="{ backgroundColor: color }"
      type="button"
      :aria-label="`选择颜色 ${color}`"
      @click="$emit('update:modelValue', color)"
    />
  </div>
</template>
