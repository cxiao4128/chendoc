<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-vue-next";
import type { SiteConfigView } from "../../api/settings";
import {
  bundledLogoUrl,
  bundledWallpaperSmallUrl,
  bundledWallpaperUrl,
  preloadImageAsset,
  withBundledSiteAssets
} from "../../config/site-assets";
import { allowedPostLoginPath } from "../../router/access";
import { useAuthStore } from "../../stores/auth";
import "./css/login.css";

type PublicSiteConfig = SiteConfigView;

const loginNoticeKey = "chendoc_login_notice";
const loginRedirectKey = "chendoc_login_redirect";
const redirectDelayMs = 720;

const router = useRouter();
const auth = useAuthStore();
const CaptchaInput = defineAsyncComponent(() => import("../../components/auth/CaptchaInput.vue"));

const username = ref("");
const password = ref("");
const captchaCode = ref("");
const captchaId = ref("");
const captchaInput = ref<{ refresh: () => Promise<void> } | null>(null);
const captchaRequired = ref(false);
const showPassword = ref(false);
const loading = ref(false);
const error = ref("");
const successMessage = ref("");
const assetsReady = ref(true);
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
const brandTitle = computed(() => site.shortName?.trim() || "陈书");
const isCustomWallpaper = computed(() => effectiveWallpaperUrl.value !== bundledWallpaperUrl);
const bundledWallpaperSrcset = computed(() => isCustomWallpaper.value
  ? undefined
  : `${bundledWallpaperSmallUrl} 720w, ${bundledWallpaperUrl} 1920w`);

function takeStoredValue(key: string) {
  try {
    const value = window.sessionStorage.getItem(key) || "";
    window.sessionStorage.removeItem(key);
    return value;
  } catch {
    return "";
  }
}

function takeLoginNotice() {
  const message = takeStoredValue(loginNoticeKey);
  if (message) error.value = message;
}

function takeLoginRedirect() {
  return takeStoredValue(loginRedirectKey);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function errorCode(err: unknown) {
  if (err && typeof err === "object" && "code" in err) return String((err as { code?: unknown }).code || "");
  return "";
}

function loginErrorMessage(err: unknown, captchaWasRequired: boolean) {
  const code = errorCode(err);
  if (code === "USER_DISABLED" || code === "USER_NOT_FOUND" || code === "USER_DELETED") return "账号或密码不正确。";
  if (code === "INVALID_CREDENTIALS") return "账号或密码不正确。";
  if (code === "CAPTCHA_REQUIRED") {
    const message = err instanceof Error ? err.message : "";
    if (captchaWasRequired && message.includes("验证码")) return "验证码不正确或已过期";
    if (message.includes("账号") || message.includes("密码")) return "账号或密码不正确";
    return "";
  }
  if (code === "LOGIN_LOCKED") return err instanceof Error ? err.message : "尝试次数过多，请稍后再来。";
  if (code === "TOTP_REQUIRED") return "请输入管理员 OTP 或一次性恢复码";
  return err instanceof Error ? err.message : "账号或密码不正确。";
}

function loginFailureText(reason: string) {
  const cleanReason = reason.trim().replace(/^登录失败[：:]\s*/, "");
  return cleanReason ? `登录失败：${cleanReason}` : "登录失败";
}

function shouldRevealCaptcha(code: string) {
  return code === "INVALID_CREDENTIALS" || code === "CAPTCHA_REQUIRED";
}

async function promptSecondFactor() {
  const { nativeFormDialog } = await import("../../services/nativeDialog");
  const values = await nativeFormDialog({
    title: "管理员验证器",
    message: "请输入 Google Authenticator / Microsoft Authenticator 的 6 位验证码。没有设备时可填写一次性恢复码。",
    confirmText: "完成登录",
    fields: [
      {
        key: "otp",
        label: "OTP 验证码",
        type: "text",
        inputmode: "numeric",
        autocomplete: "one-time-code",
        maxlength: 6,
        placeholder: "6 位验证码",
        autofocus: true
      },
      {
        key: "recoveryCode",
        label: "一次性恢复码",
        type: "text",
        autocomplete: "off",
        placeholder: "没有 OTP 时填写"
      }
    ]
  });
  const otp = values?.otp?.trim() || "";
  const recoveryCode = values?.recoveryCode?.trim() || "";
  if (!values || (!otp && !recoveryCode)) {
    throw Object.assign(new Error("请输入管理员 OTP 或一次性恢复码"), { code: "TOTP_REQUIRED" });
  }
  return {
    otp: otp || undefined,
    recoveryCode: recoveryCode || undefined
  };
}

async function signIn(secondFactor: Record<string, unknown> = {}) {
  const captcha = captchaRequired.value && captchaId.value && captchaCode.value
    ? { captchaId: captchaId.value, captchaCode: captchaCode.value }
    : {};
  const { a0: submitCredential } = await import("../../api/auth");
  const response = await submitCredential({
    username: username.value,
    password: password.value,
    ...captcha,
    ...secondFactor
  });
  auth.setSession(response.user, response.token, response.expiresAt);
  successMessage.value = "登录成功，正在进入工作台";
  await wait(redirectDelayMs);
  await router.replace(allowedPostLoginPath(response.user, takeLoginRedirect()));
}

async function resolvePreloadedImage(url: string, fallback: string) {
  if (await preloadImageAsset(url)) return url;
  if (url !== fallback && await preloadImageAsset(fallback)) return fallback;
  return fallback;
}

async function prepareLoginPage() {
  takeLoginNotice();

  let nextConfig: PublicSiteConfig | null = null;
  try {
    const { getPublicSiteConfigApi } = await import("../../api/settings");
    nextConfig = withBundledSiteAssets((await getPublicSiteConfigApi()).config);
  } catch {
    // Bundled assets remain the fallback.
  }

  if (!nextConfig) {
    wallpaperReady.value = true;
    return;
  }

  const next = nextConfig;
  const logoUrl = next.logoUrl || bundledLogoUrl;
  const wallpaperUrl = next.authWallpaperUrl || bundledWallpaperUrl;

  Object.assign(site, {
    ...next,
    logoUrl: site.logoUrl,
    authWallpaperUrl: site.authWallpaperUrl
  });

  void resolvePreloadedImage(logoUrl, bundledLogoUrl).then((readyLogoUrl) => {
    site.logoUrl = readyLogoUrl;
  });
  void resolvePreloadedImage(wallpaperUrl, bundledWallpaperUrl).then((readyWallpaperUrl) => {
    site.authWallpaperUrl = readyWallpaperUrl;
    wallpaperReady.value = true;
  });
}

async function submit() {
  loading.value = true;
  error.value = "";
  successMessage.value = "";

  try {
    await signIn();
  } catch (err) {
    const code = errorCode(err);
    const captchaWasRequired = captchaRequired.value;
    if (shouldRevealCaptcha(code)) captchaRequired.value = true;
    if (code === "TOTP_REQUIRED") {
      loading.value = false;
      try {
        const secondFactor = await promptSecondFactor();
        loading.value = true;
        error.value = "";
        await signIn(secondFactor);
        return;
      } catch (secondErr) {
        const secondCode = errorCode(secondErr);
        if (shouldRevealCaptcha(secondCode)) captchaRequired.value = true;
        error.value = loginFailureText(loginErrorMessage(secondErr, captchaWasRequired));
        if (captchaRequired.value) await (captchaInput.value?.refresh() ?? Promise.resolve()).catch(() => undefined);
        return;
      }
    }
    error.value = loginFailureText(loginErrorMessage(err, captchaWasRequired));
    if (captchaRequired.value) await (captchaInput.value?.refresh() ?? Promise.resolve()).catch(() => undefined);
  } finally {
    password.value = "";
    loading.value = false;
  }
}

onMounted(() => {
  void prepareLoginPage();
});
</script>

<template>
  <main class="login-page" :class="{ 'is-ready': assetsReady, 'is-wallpaper-ready': wallpaperReady, 'is-custom-wallpaper': isCustomWallpaper }">
    <section class="auth-shell" aria-label="ChenDoc 登录页">
      <div class="auth-scene" aria-hidden="true">
        <img
          class="auth-scene__image"
          :src="effectiveWallpaperUrl"
          :srcset="bundledWallpaperSrcset"
          sizes="100vw"
          alt=""
          decoding="async"
          fetchpriority="high"
          referrerpolicy="no-referrer"
        />
      </div>
      <div class="auth-atmosphere" aria-hidden="true" />

      <section class="auth-home">
        <section class="auth-hero" aria-label="ChenDoc">
          <div class="auth-hero__copy">
            <h1>陈书</h1>
            <strong>ChenDoc 文档系统</strong>
            <span></span>
          </div>
          <small class="auth-hero__copyright">© 2026 ChenDoc. All rights reserved.</small>
        </section>

        <section class="auth-panel" aria-label="登录">
          <form class="auth-card" autocomplete="off" @submit.prevent="submit">
            <div class="auth-autofill-trap" aria-hidden="true">
              <input type="text" name="username" autocomplete="username" tabindex="-1" />
              <input type="password" name="password" autocomplete="current-password" tabindex="-1" />
            </div>

            <div class="auth-card__header">
              <img class="auth-brand__logo" :src="effectiveLogoUrl" alt="" referrerpolicy="no-referrer" />
              <div class="auth-heading">
                <p class="auth-heading__title">{{ brandTitle }}</p>
                <p class="auth-heading__subtitle">文档管理平台</p>
              </div>
            </div>

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
                  placeholder="用户名"
                  required
                  spellcheck="false"
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
                  placeholder="密码"
                  required
                />
                <button type="button" aria-label="切换密码显示" @click="showPassword = !showPassword">
                  <EyeOff v-if="showPassword" :size="18" />
                  <Eye v-else :size="18" />
                </button>
              </div>
            </label>

            <CaptchaInput
              v-if="captchaRequired"
              ref="captchaInput"
              v-model:code="captchaCode"
              v-model:captcha-id="captchaId"
            />

            <div class="auth-actions">
              <span class="auth-links">
                <RouterLink to="/forgot-password">忘记密码?</RouterLink>
                <i></i>
                <RouterLink class="auth-register-link" to="/register">立即注册</RouterLink>
              </span>
            </div>

            <p v-if="error" class="cd-error" role="alert">{{ error }}</p>
            <p v-if="successMessage" class="auth-success" role="status">{{ successMessage }}</p>

            <button class="auth-submit" type="submit" :disabled="loading">
              {{ loading ? "登录中" : "进入陈书" }}
            </button>
          </form>
        </section>
      </section>
    </section>
  </main>
</template>
