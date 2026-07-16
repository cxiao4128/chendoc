<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{
  image: [file: File];
  video: [file: File];
  attachment: [file: File];
  replacement: [file: File];
}>();

const imageInput = ref<HTMLInputElement | null>(null);
const videoInput = ref<HTMLInputElement | null>(null);
const attachmentInput = ref<HTMLInputElement | null>(null);
const replacementInput = ref<HTMLInputElement | null>(null);

function openImage() { imageInput.value?.click(); }
function openVideo() { videoInput.value?.click(); }
function openAttachment() { attachmentInput.value?.click(); }
function openReplacement() { replacementInput.value?.click(); }

function clearVideo() {
  if (videoInput.value) videoInput.value.value = "";
}

function emitSelected(event: Event, kind: "image" | "video" | "attachment" | "replacement") {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    if (kind === "image") emit("image", file);
    else if (kind === "video") emit("video", file);
    else if (kind === "attachment") emit("attachment", file);
    else emit("replacement", file);
  }
  input.value = "";
}

defineExpose({ openImage, openVideo, openAttachment, openReplacement, clearVideo });
</script>

<template>
  <input
    ref="imageInput"
    data-testid="editor-image-input"
    hidden
    type="file"
    accept="image/*,.heic,.heif"
    @change="emitSelected($event, 'image')"
  />
  <input
    ref="videoInput"
    data-testid="editor-video-input"
    hidden
    type="file"
    accept="video/*,.mp4,.mov,.m4v,.webm,.ogv"
    @change="emitSelected($event, 'video')"
  />
  <input
    ref="attachmentInput"
    data-testid="editor-attachment-input"
    hidden
    type="file"
    accept=".pdf,.zip,.txt,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/zip,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
    @change="emitSelected($event, 'attachment')"
  />
  <input
    ref="replacementInput"
    data-testid="editor-replacement-input"
    hidden
    type="file"
    @change="emitSelected($event, 'replacement')"
  />
</template>
