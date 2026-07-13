<script setup lang="ts">
defineProps<{
  src: string;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <button v-if="src" class="chendoc-editor__preview" type="button" @click="emit('close')">
    <img :src="src" alt="" />
  </button>
</template>
