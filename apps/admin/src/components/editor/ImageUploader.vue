<script setup lang="ts">
import { ref } from "vue";
import { ImageUp } from "lucide-vue-next";
import { useUpload } from "../../composables/useUpload";
import "./image-uploader.css";

const props = defineProps<{ docUid: string }>();
const emit = defineEmits<{ uploaded: [url: string] }>();
const input = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const error = ref("");
const { uploadFile } = useUpload();

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploading.value = true;
  error.value = "";
  try {
    const url = await uploadFile(file, props.docUid);
    emit("uploaded", url);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "上传失败";
  } finally {
    uploading.value = false;
    if (input.value) input.value.value = "";
  }
}
</script>

<template>
  <div class="image-uploader">
    <input ref="input" type="file" accept="image/*" @change="onFile" />
    <button class="cd-button" type="button" :disabled="uploading" @click="input?.click()">
      <ImageUp :size="16" />
      {{ uploading ? "上传中..." : "选择图片" }}
    </button>
    <span v-if="error">{{ error }}</span>
  </div>
</template>
