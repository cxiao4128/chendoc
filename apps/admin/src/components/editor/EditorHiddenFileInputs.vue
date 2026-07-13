<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{
  image: [file: File];
  video: [file: File];
  replacement: [file: File];
}>();

const imageInput = ref<HTMLInputElement | null>(null);
const videoInput = ref<HTMLInputElement | null>(null);
const replacementInput = ref<HTMLInputElement | null>(null);

function openImage() {
  imageInput.value?.click();
}

function openVideo() {
  videoInput.value?.click();
}

function openReplacement() {
  replacementInput.value?.click();
}

function clearVideo() {
  if (videoInput.value) videoInput.value.value = "";
}

function onImageFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("image", file);
  input.value = "";
}

function onVideoFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("video", file);
}

function onReplacementFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("replacement", file);
  input.value = "";
}

defineExpose({ openImage, openVideo, openReplacement, clearVideo });
</script>

<template>
  <input ref="imageInput" data-testid="editor-image-input" hidden type="file" accept="image/*" @change="onImageFile" />
  <input ref="videoInput" data-testid="editor-video-input" hidden type="file" accept="video/mp4,video/webm,video/quicktime,video/*" @change="onVideoFile" />
  <input ref="replacementInput" data-testid="editor-replacement-input" hidden type="file" @change="onReplacementFile" />
</template>
