<script setup lang="ts">
import { nextTick, reactive, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { nativeDialogState, resolveNativeDialog, type NativeDialogResult } from "../../services/nativeDialog";
import "./native-dialog.css";

const dialogEl = ref<HTMLDialogElement | null>(null);
const fieldValues = reactive<Record<string, string>>({});

watch(() => nativeDialogState.request, async (request) => {
  if (!request) {
    if (dialogEl.value?.open) dialogEl.value.close();
    return;
  }

  for (const key of Object.keys(fieldValues)) delete fieldValues[key];
  for (const field of request.fields || []) fieldValues[field.key] = field.value || "";

  await nextTick();
  const dialog = dialogEl.value;
  if (dialog && !dialog.open) dialog.showModal();
}, { immediate: true });

function cancel() {
  resolveNativeDialog(null);
}

function confirm() {
  const request = nativeDialogState.request;
  if (!request) return;
  if (request.kind === "confirm") {
    resolveNativeDialog(true);
    return;
  }
  if (request.kind === "prompt") {
    const key = request.fields?.[0]?.key || "value";
    resolveNativeDialog(fieldValues[key] ?? "");
    return;
  }
  resolveNativeDialog({ ...fieldValues } as NativeDialogResult);
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogEl"
      class="native-dialog"
      :class="{
        'is-danger': nativeDialogState.request?.danger,
        'is-auth': nativeDialogState.request?.theme === 'auth'
      }"
      @cancel.prevent="cancel"
      @close="cancel"
    >
      <form v-if="nativeDialogState.request" class="native-dialog__panel" method="dialog" @submit.prevent="confirm">
        <header class="native-dialog__head">
          <div>
            <h2>{{ nativeDialogState.request.title }}</h2>
            <p v-if="nativeDialogState.request.message">{{ nativeDialogState.request.message }}</p>
          </div>
          <button class="native-dialog__close" type="button" aria-label="关闭" @click="cancel">
            <X :size="18" />
          </button>
        </header>

        <div v-if="nativeDialogState.request.fields?.length" class="native-dialog__fields">
          <label v-for="field in nativeDialogState.request.fields" :key="field.key" class="cd-label">
            {{ field.label }}
            <input
              v-model="fieldValues[field.key]"
              class="cd-input"
              :type="field.type || 'text'"
              :placeholder="field.placeholder"
              :autocomplete="field.autocomplete || 'off'"
              :inputmode="field.inputmode"
              :maxlength="field.maxlength"
              :required="field.required"
              :autofocus="field.autofocus"
            />
          </label>
        </div>

        <div class="native-dialog__actions">
          <button class="cd-button" type="button" @click="cancel">
            {{ nativeDialogState.request.cancelText || "取消" }}
          </button>
          <button class="cd-button" :class="{ danger: nativeDialogState.request.danger, primary: !nativeDialogState.request.danger }" type="submit">
            {{ nativeDialogState.request.confirmText || "确认" }}
          </button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>
