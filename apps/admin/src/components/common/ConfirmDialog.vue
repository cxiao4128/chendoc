<script setup lang="ts">
import { X } from "lucide-vue-next";
import "./confirm-dialog.css";

const open = defineModel<boolean>({ default: false });
defineProps<{
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}>();
defineEmits<{ confirm: [] }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="confirm-dialog" role="dialog" aria-modal="true">
      <div class="confirm-dialog__panel">
        <button class="confirm-dialog__close" type="button" aria-label="关闭" @click="open = false">
          <X :size="18" />
        </button>
        <h2>{{ title }}</h2>
        <p>{{ message }}</p>
        <div class="confirm-dialog__actions">
          <button class="cd-button" type="button" @click="open = false">取消</button>
          <button class="cd-button" :class="{ danger }" type="button" @click="$emit('confirm'); open = false">
            {{ confirmText || '确认' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
