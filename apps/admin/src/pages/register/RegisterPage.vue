<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { Eye, EyeOff, KeyRound, LockKeyhole, UserRound } from "lucide-vue-next";
import CaptchaInput from "../../components/auth/CaptchaInput.vue";
import { getPublicSiteConfigApi } from "../../api/settings";
import { bundledLogoUrl, bundledWallpaperUrl, defaultRemoteLogoUrl, defaultRemoteWallpaperUrl, withBundledSiteAssets } from "../../config/site-assets";
import { registerApi } from "../../api/auth";
import "./register.css";

const router = useRouter();
const username = ref("");
const password = ref("");
const confirmPassword = ref("");
const inviteCode = ref("");
const captchaCode = ref("");
const captchaId = ref("");
const captchaInput = ref<{ refresh: () => Promise<void> } | null>(null);
const showPassword = ref(false);
const loading = ref(false);
const error = ref("");
const success = ref("");
const site = reactive({
  brandName: "陈书",
  shortName: "陈书",
  logoUrl: bundledLogoUrl,
  authWallpaperUrl: bundledWallpaperUrl,
  preferRemoteLogo: false,
  preferRemoteWallpaper: false,
  copyright: "Copyright © 2026 陈书. All rights reserved"
});

const effectiveLogoUrl = computed(() => site.logoUrl || bundledLogoUrl);
const effectiveWallpaperUrl = computed(() => site.authWallpaperUrl || bundledWallpaperUrl);
const authStyle = computed(() => ({ "--auth-bg-url": `url("${effectiveWallpaperUrl.value}")` }));
const brandTitle = computed(() => site.shortName?.trim() || "陈书");

function validate() {
  if (username.value.length < 6 || !/^[A-Za-z0-9_]+$/.test(username.value)) return "账号至少 6 位，只能包含字母、数字、下划线";
  if (password.value.length < 8 || !/[A-Z]/.test(password.value) || !/[a-z]/.test(password.value)) return "密码至少 8 位，并且必须包含大小写字母";
  if (password.value !== confirmPassword.value) return "两次密码不一致";
  if (!inviteCode.value.trim()) return "请输入注册卡密";
  return "";
}

async function submit() {
  error.value = validate();
  success.value = "";
  if (error.value) return;
  loading.value = true;
  try {
    await registerApi({
      username: username.value,
      password: password.value,
      inviteCode: inviteCode.value.trim().toUpperCase(),
      captchaId: captchaId.value,
      captchaCode: captchaCode.value
    });
    success.value = "注册成功，正在进入登录页";
    setTimeout(() => router.push("/login"), 700);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "注册失败，请检查注册卡密和验证码";
    await (captchaInput.value?.refresh() ?? Promise.resolve()).catch(() => undefined);
  } finally {
    password.value = "";
    confirmPassword.value = "";
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    Object.assign(site, withBundledSiteAssets((await getPublicSiteConfigApi()).config));
  } catch {
    // keep bundled defaults
  }
});
</script>

<template>
  <main class="register-page" :style="authStyle">
    <img class="register-page__wallpaper" :src="effectiveWallpaperUrl" alt="" fetchpriority="high" decoding="async" />
    <header class="auth-topbar">
      <RouterLink class="auth-brand" to="/login">
        <img class="auth-brand__logo" :src="effectiveLogoUrl" alt="" />
        <span class="auth-brand__copy">
          <strong>{{ brandTitle }}</strong>
          <small>chensdoc</small>
        </span>
      </RouterLink>
    </header>

    <section class="auth-stage" aria-label="注册陈书账号">
      <form class="auth-card auth-card--register" @submit.prevent="submit">
        <div class="auth-card__icon">
          <img :src="effectiveLogoUrl" alt="" />
        </div>
        <h1>{{ brandTitle }}</h1>

        <label class="auth-field">
          <span>账号</span>
          <div class="auth-input">
            <UserRound :size="18" />
            <input v-model.trim="username" autocomplete="username" placeholder="至少 6 位字母、数字或下划线" required />
          </div>
        </label>

        <label class="auth-field">
          <span>密码</span>
          <div class="auth-input">
            <LockKeyhole :size="18" />
            <input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="至少 8 位，包含大小写" required />
            <button type="button" aria-label="切换密码显示" @click="showPassword = !showPassword">
              <EyeOff v-if="showPassword" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </div>
        </label>

        <label class="auth-field">
          <span>确认密码</span>
          <div class="auth-input">
            <LockKeyhole :size="18" />
            <input v-model="confirmPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="再次输入密码" required />
          </div>
        </label>

        <label class="auth-field">
          <span>注册卡密</span>
          <div class="auth-input">
            <KeyRound :size="18" />
            <input v-model.trim="inviteCode" autocomplete="off" placeholder="输入一次性注册卡密" required />
          </div>
        </label>

        <CaptchaInput ref="captchaInput" v-model:code="captchaCode" v-model:captcha-id="captchaId" />
        <p v-if="error" class="cd-error" role="alert">{{ error }}</p>
        <p v-if="success" class="register-page__success">{{ success }}</p>
        <button class="auth-submit" type="submit" :disabled="loading">
          {{ loading ? "注册中..." : "创建账号" }}
        </button>
        <div class="auth-row">
          <RouterLink to="/login">已有账号，去登录</RouterLink>
        </div>
      </form>
    </section>

    <footer class="auth-footer">{{ site.copyright }}</footer>
  </main>
</template>
