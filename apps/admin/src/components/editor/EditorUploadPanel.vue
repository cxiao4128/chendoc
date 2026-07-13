<script setup lang="ts">
const imageCaption = defineModel<string>("imageCaption", { required: true });

defineProps<{
  uploading: boolean;
  failedUpload: { file: File; kind: "image" | "video" | "file"; message: string } | null;
  selectedImage: boolean;
}>();

const emit = defineEmits<{
  retry: [];
  replace: [];
  remove: [];
  updateImageAttrs: [patch: Record<string, string | null>];
  setImageCenter: [centered: boolean];
}>();
</script>

<template>
  <div v-if="uploading || failedUpload || selectedImage" class="chendoc-editor__upload">
    <span v-if="uploading" class="chendoc-editor__hint">正在上传文件...</span>
    <div v-if="failedUpload" class="chendoc-editor__upload-failed" role="alert">
      <span class="chendoc-editor__error">{{ failedUpload.file.name }}：{{ failedUpload.message }}</span>
      <div>
        <button type="button" :disabled="uploading" @click="emit('retry')">重试</button>
        <button type="button" :disabled="uploading" @click="emit('replace')">替换</button>
        <button type="button" :disabled="uploading" @click="emit('remove')">删除</button>
      </div>
    </div>
    <div v-if="selectedImage" class="chendoc-editor__image-tools">
      <button type="button" @click="emit('updateImageAttrs', { width: '50%' })">50%</button>
      <button type="button" @click="emit('updateImageAttrs', { width: '75%' })">75%</button>
      <button type="button" @click="emit('updateImageAttrs', { width: '100%' })">100%</button>
      <button type="button" @click="emit('setImageCenter', true)">居中</button>
      <button type="button" @click="emit('setImageCenter', false)">取消居中</button>
      <input v-model="imageCaption" placeholder="图片说明" @change="emit('updateImageAttrs', { title: imageCaption, alt: imageCaption })" />
    </div>
  </div>
</template>
