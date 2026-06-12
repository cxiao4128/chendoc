<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
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

const dialogEl = ref<HTMLDialogElement | null>(null);

watch(open, async (value) => {
  await nextTick();
  const dialog = dialogEl.value;
  if (!dialog) return;
  if (value && !dialog.open) dialog.showModal();
  if (!value && dialog.open) dialog.close();
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialogEl" class="confirm-dialog" :class="{ 'is-danger': danger }" @cancel.prevent="open = false">
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
    </dialog>
  </Teleport>
</template>
