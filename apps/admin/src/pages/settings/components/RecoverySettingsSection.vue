<script setup lang="ts">
import type { SiteConfigView } from "@/services/api";

defineProps<{
  site: SiteConfigView;
  saving: boolean;
  message: string;
}>();

const emit = defineEmits<{
  submit: [];
  updateField: [field: keyof SiteConfigView, value: string];
}>();

function inputValue(event: Event) {
  return (event.target as HTMLInputElement).value.trim();
}
</script>

<template>
  <form class="settings-page__panel settings-page__appearance" @submit.prevent="$emit('submit')">
    <div class="settings-page__panel-head">
      <div>
        <small>账号找回</small>
        <h2>忘记密码联系信息</h2>
      </div>
      <button class="cd-button primary" type="submit" :disabled="saving">{{ saving ? "保存中" : "保存联系方式" }}</button>
    </div>
    <label class="cd-label settings-page__wide">
      客服联系方式
      <input
        :value="site.recoveryContact"
        class="cd-input"
        placeholder="QQ / 微信 / 邮箱 / 电话"
        @input="emit('updateField', 'recoveryContact', inputValue($event))"
      />
    </label>
    <p class="settings-page__hint">保存后，忘记密码页会提示用户联系客服重置账号。</p>
    <p v-if="message" class="settings-page__save-message">{{ message }}</p>
  </form>
</template>
