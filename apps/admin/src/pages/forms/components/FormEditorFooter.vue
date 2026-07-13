<script setup lang="ts">
import { ExternalLink, Save, Send } from "lucide-vue-next";

defineProps<{
  isEditing: boolean;
  published: boolean;
  saving: boolean;
}>();

defineEmits<{
  save: [];
  openForm: [];
  publish: [];
}>();
</script>

<template>
  <footer class="form-footer">
    <button class="form-footer__btn secondary" type="button" :disabled="saving" @click="$emit('save')">
      <Save class="form-inline-icon" :size="16" />
      {{ isEditing ? "保存修改" : "保存草稿" }}
    </button>
    <button v-if="published" class="form-footer__btn secondary" type="button" @click="$emit('openForm')">
      <ExternalLink class="form-inline-icon" :size="16" />
      查看表单
    </button>
    <button class="form-footer__btn primary" type="button" :disabled="saving" @click="$emit('publish')">
      <Send class="form-inline-icon form-inline-icon--wide" :size="16" />
      {{ published ? "保存并更新" : "发布表单" }}
    </button>
  </footer>
</template>
