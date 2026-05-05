<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { RefreshCw } from "lucide-vue-next";
import { useCaptcha } from "../../composables/useCaptcha";
import "./captcha-input.css";

const code = defineModel<string>("code", { default: "" });
const captchaId = defineModel<string>("captchaId", { default: "" });
const { captchaId: nextId, image, loading, refreshCaptcha } = useCaptcha();
const input = ref<HTMLInputElement | null>(null);

watch(nextId, (value) => {
  captchaId.value = value;
});

async function refresh() {
  code.value = "";
  await refreshCaptcha();
  input.value?.focus();
}

function normalizeCode(event: Event) {
  code.value = (event.target as HTMLInputElement).value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

onMounted(refreshCaptcha);
</script>

<template>
  <div class="captcha-input">
    <label class="cd-label captcha-input__field">
      验证码
      <input ref="input" v-model="code" class="cd-input" autocomplete="off" autocapitalize="characters" inputmode="text" maxlength="5" @input="normalizeCode" />
    </label>
    <button class="captcha-input__image" type="button" :disabled="loading" aria-label="刷新验证码" @click="refresh">
      <img v-if="image" :src="image" alt="验证码" />
      <span v-else>加载中</span>
    </button>
    <button class="cd-button captcha-input__refresh" type="button" :disabled="loading" aria-label="刷新验证码" @click="refresh">
      <RefreshCw :size="16" />
    </button>
  </div>
</template>
