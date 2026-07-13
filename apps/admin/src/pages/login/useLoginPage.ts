import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import type { SiteConfigView } from "@/services/api";
import {
  bundledLogoUrl,
  bundledWallpaperSmallUrl,
  bundledWallpaperUrl,
  preloadImageAsset,
  withBundledSiteAssets
} from "../../config/site-assets";
import { allowedPostLoginPath } from "../../router/access";
import { useAuthStore } from "../../stores/auth";
import {
  errorCode,
  loginErrorMessage,
  loginFailureText,
  promptSecondFactor,
  shouldRevealCaptcha,
} from "./loginAuthHelpers";

type PublicSiteConfig = SiteConfigView;

const loginNoticeKey = "chendoc_login_notice";
const loginRedirectKey = "chendoc_login_redirect";

function takeStoredValue(key: string) {
  try {
    const value = window.sessionStorage.getItem(key) || "";
    window.sessionStorage.removeItem(key);
    return value;
  } catch {
    return "";
  }
}

export function useLoginPage() {
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
  let prepareCancelled = false;

  function takeLoginNotice() {
    const message = takeStoredValue(loginNoticeKey);
    if (message) error.value = message;
  }

  function takeLoginRedirect() {
    return takeStoredValue(loginRedirectKey);
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
    await router.replace(allowedPostLoginPath(response.user, takeLoginRedirect()));
  }

  async function resolvePreloadedImage(url: string, fallback: string) {
    if (await preloadImageAsset(url)) return url;
    if (url !== fallback && await preloadImageAsset(fallback)) return fallback;
    return fallback;
  }

  async function prepareLoginPage() {
    if (prepareCancelled) return;
    takeLoginNotice();
    let nextConfig: PublicSiteConfig | null = null;
    try {
      const { getPublicSiteConfigApi } = await import("@/services/api");
      nextConfig = withBundledSiteAssets((await getPublicSiteConfigApi()).config);
    } catch {
      // Bundled assets remain the fallback.
    }

    if (prepareCancelled || !nextConfig) {
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
      if (prepareCancelled) return;
      site.logoUrl = readyLogoUrl;
    });
    void resolvePreloadedImage(wallpaperUrl, bundledWallpaperUrl).then((readyWallpaperUrl) => {
      if (prepareCancelled) return;
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
    prepareCancelled = false;
    void prepareLoginPage();
  });

  onBeforeUnmount(() => {
    prepareCancelled = true;
  });

  return {
    CaptchaInput,
    username,
    password,
    captchaCode,
    captchaId,
    captchaInput,
    captchaRequired,
    showPassword,
    loading,
    error,
    successMessage,
    assetsReady,
    wallpaperReady,
    effectiveLogoUrl,
    effectiveWallpaperUrl,
    brandTitle,
    isCustomWallpaper,
    bundledWallpaperSrcset,
    submit,
  };
}
