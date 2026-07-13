<script setup lang="ts">
defineProps<{
  visible: boolean;
  top: number;
  left: number;
}>();

const emit = defineEmits<{
  open: [];
  dragstart: [event: DragEvent];
}>();
</script>

<template>
  <button
    v-if="visible"
    class="chendoc-editor__block-handle"
    type="button"
    draggable="true"
    :style="{ top: `${top}px`, left: `${left}px` }"
    title="插入或移动当前块"
    aria-label="插入或移动当前块"
    @click="emit('open')"
    @dragstart="emit('dragstart', $event)"
  >⋮⋮</button>
</template>
