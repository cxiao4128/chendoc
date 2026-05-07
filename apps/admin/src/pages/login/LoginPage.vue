<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-vue-next";
import CaptchaInput from "../../components/auth/CaptchaInput.vue";
import { loginApi } from "../../api/auth";
import { getPublicSiteConfigApi } from "../../api/settings";
import {
  bundledLogoUrl,
  bundledWallpaperUrl,
  defaultRemoteLogoUrl,
  defaultRemoteWallpaperUrl,
  withBundledSiteAssets
} from "../../config/site-assets";
import { useAuthStore } from "../../stores/auth";
import "./login.css";

const adminCaptchaBypassUsername = "xchen";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const username = ref("");
const password = ref("");
const captchaCode = ref("");
const captchaId = ref("");
const captchaInput = ref<{ refresh: () => Promise<void> } | null>(null);
const remember = ref(true);
const showPassword = ref(false);
const loading = ref(false);
const error = ref("");
const usernameIntent = ref(false);
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
const normalizedUsername = computed(() => username.value.trim().toLowerCase());
const shouldHideCaptcha = computed(() => normalizedUsername.value === adminCaptchaBypassUsername);

function markUsernameIntent() {
  usernameIntent.value = true;
}

function scrubAutofilledAdminUsername() {
  if (!usernameIntent.value && normalizedUsername.value === adminCaptchaBypassUsername) {
    username.value = "";
  }
}

watch(shouldHideCaptcha, (value) => {
  if (value) {
    captchaCode.value = "";
    captchaId.value = "";
  }
});

async function submit() {
  loading.value = true;
  error.value = "";
  const captcha = !shouldHideCaptcha.value && captchaId.value && captchaCode.value
    ? { captchaId: captchaId.value, captchaCode: captchaCode.value }
    : {};
  try {
    const response = await loginApi({
      username: username.value,
      password: password.value,
      ...captcha
    });
    auth.setSession(response.sessionId, response.sessionKey, response.user);
    await router.push(String(route.query.redirect || "/admin/docs"));
  } catch (err) {
    error.value = err instanceof Error ? err.message : "登录失败，请检查账号或密码";
    if (!shouldHideCaptcha.value) await (captchaInput.value?.refresh() ?? Promise.resolve()).catch(() => undefined);
  } finally {
    password.value = "";
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    Object.assign(site, withBundledSiteAssets((await getPublicSiteConfigApi()).config));
  } catch {
    // keep bundled defaults
  }

  [0, 120, 320].forEach((delay) => {
    window.setTimeout(scrubAutofilledAdminUsername, delay);
  });
});
</script>

<template>
  <main class="login-page" :style="authStyle">
    <img class="login-page__wallpaper" :src="effectiveWallpaperUrl" alt="" fetchpriority="high" decoding="async" />
    <header class="auth-topbar">
      <RouterLink class="auth-brand" to="/login">
        <img class="auth-brand__logo" :src="effectiveLogoUrl" alt="" />
        <span class="auth-brand__copy">
          <strong>{{ brandTitle }}</strong>
          <small>chensdoc</small>
        </span>
      </RouterLink>
    </header>

    <section class="auth-stage" aria-label="陈书登录">
      <form class="auth-card" autocomplete="off" @submit.prevent="submit">
        <div class="auth-autofill-trap" aria-hidden="true">
          <input type="text" name="username" autocomplete="username" tabindex="-1" />
          <input type="password" name="password" autocomplete="current-password" tabindex="-1" />
        </div>

        <img class="auth-card__logo" :src="effectiveLogoUrl" alt="" />
        <h1>{{ brandTitle }}</h1>

        <label class="auth-field">
          <span>用户名</span>
          <div class="auth-input">
            <UserRound :size="18" />
            <input
              v-model.trim="username"
              autocomplete="off"
              autocapitalize="none"
              inputmode="text"
              name="login-handle"
              placeholder="请输入用户名"
              required
              spellcheck="false"
              @keydown="markUsernameIntent"
              @paste="markUsernameIntent"
              @drop="markUsernameIntent"
            />
          </div>
        </label>

        <label class="auth-field">
          <span>密码</span>
          <div class="auth-input">
            <LockKeyhole :size="18" />
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              name="login-passcode"
              placeholder="请输入密码"
              required
            />
            <button type="button" aria-label="切换密码显示" @click="showPassword = !showPassword">
              <EyeOff v-if="showPassword" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </div>
        </label>

        <template v-if="!shouldHideCaptcha">
          <CaptchaInput ref="captchaInput" v-model:code="captchaCode" v-model:captcha-id="captchaId" />
        </template>
        <p v-else class="auth-captcha-note is-admin">欢迎你小陈</p>

        <div class="auth-row">
          <label class="auth-check">
            <input v-model="remember" type="checkbox" />
            <span>记住登录状态</span>
          </label>
          <RouterLink to="/register">没有账号？点击注册</RouterLink>
        </div>

        <p v-if="error" class="cd-error" role="alert">{{ error }}</p>
        <button class="auth-submit" type="submit" :disabled="loading">
          {{ loading ? "进入中..." : "进入陈书" }}
        </button>
      </form>
    </section>

    <footer class="auth-footer">{{ site.copyright }}</footer>
  </main>
</template>
