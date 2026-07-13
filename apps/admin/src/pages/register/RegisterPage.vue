<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { Eye, EyeOff, KeyRound, LockKeyhole, UserRound } from "lucide-vue-next";
import CaptchaInput from "../../components/auth/CaptchaInput.vue";
import { getPublicSiteConfigApi } from "@/services/api";
import { bundledLogoUrl, bundledWallpaperUrl, preloadImageAsset, withBundledSiteAssets } from "../../config/site-assets";
import "./css/register.css";

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
const wallpaperReady = ref(false);
const site = reactive({
  brandName: "陈书",
  shortName: "陈书",
  logoUrl: bundledLogoUrl,
  authWallpaperUrl: bundledWallpaperUrl,
  preferRemoteLogo: false,
  preferRemoteWallpaper: false,
  copyright: "2026 陈书"
});

const effectiveLogoUrl = computed(() => site.logoUrl || bundledLogoUrl);
const effectiveWallpaperUrl = computed(() => site.authWallpaperUrl || bundledWallpaperUrl);
const isCustomWallpaper = computed(() => effectiveWallpaperUrl.value !== bundledWallpaperUrl);
const authStyle = computed(() => isCustomWallpaper.value ? { "--auth-bg-url": `url("${effectiveWallpaperUrl.value}")` } : {});
const brandTitle = computed(() => site.shortName?.trim() || "陈书");

function applySiteConfig(config: Awaited<ReturnType<typeof getPublicSiteConfigApi>>["config"]) {
  const next = withBundledSiteAssets(config);
  const logoUrl = next.logoUrl || bundledLogoUrl;
  const wallpaperUrl = next.authWallpaperUrl || bundledWallpaperUrl;

  Object.assign(site, {
    ...next,
    logoUrl: site.logoUrl,
    authWallpaperUrl: site.authWallpaperUrl
  });

  if (logoUrl !== site.logoUrl) {
    void preloadImageAsset(logoUrl).then((ready) => {
      if (ready) site.logoUrl = logoUrl;
    });
  }
  if (wallpaperUrl !== site.authWallpaperUrl) {
    void preloadImageAsset(wallpaperUrl).then((ready) => {
      if (ready) site.authWallpaperUrl = wallpaperUrl;
    });
  }
}

function validate() {
  if (username.value.length < 6 || !/^[A-Za-z0-9_]+$/.test(username.value)) return "账号至少 6 位，只能包含字母、数字、下划线";
  if (password.value.length < 12) return "密码至少 12 位";
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
    const { a1: createCredential } = await import("../../api/auth");
    await createCredential({
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
  void preloadImageAsset(bundledWallpaperUrl).then((ready) => {
    wallpaperReady.value = ready;
  });

  try {
    applySiteConfig((await getPublicSiteConfigApi()).config);
  } catch {
    // keep bundled defaults
  }
});
</script>

<template>
  <main class="register-page" :class="{ 'is-wallpaper-ready': wallpaperReady, 'is-custom-wallpaper': isCustomWallpaper }" :style="authStyle">
    <header class="auth-topbar">
      <RouterLink class="auth-brand" to="/login">
        <img class="auth-brand__logo" :src="effectiveLogoUrl" alt="" referrerpolicy="no-referrer" />
        <span class="auth-brand__copy">
          <strong>{{ brandTitle }}</strong>
          <small>文档管理平台</small>
        </span>
      </RouterLink>
    </header>

    <section class="auth-stage" aria-label="注册陈书账号">
      <form class="auth-card auth-card--register" @submit.prevent="submit">
        <div class="auth-card__icon">
          <img :src="effectiveLogoUrl" alt="" referrerpolicy="no-referrer" />
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
            <input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="至少 12 位" required />
            <button
              type="button"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
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
