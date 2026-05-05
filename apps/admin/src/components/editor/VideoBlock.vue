<script setup lang="ts">
import "./video-block.css";

defineProps<{ src: string; title?: string }>();
</script>

<template>
  <figure class="video-block">
    <video :src="src" controls preload="metadata" />
    <figcaption v-if="title">{{ title }}</figcaption>
  </figure>
</template>
