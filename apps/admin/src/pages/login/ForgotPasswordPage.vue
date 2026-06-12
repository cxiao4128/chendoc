<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { UserRound } from "lucide-vue-next";
import { getPublicSiteConfigApi } from "../../api/settings";
import {
  bundledLogoUrl,
  bundledWallpaperUrl,
  preloadImageAsset,
  withBundledSiteAssets
} from "../../config/site-assets";
import "./login.css";

type PublicSiteConfig = Awaited<ReturnType<typeof getPublicSiteConfigApi>>["config"];

const username = ref("");
const submitted = ref(false);
const assetsReady = ref(false);
const wallpaperReady = ref(false);
const site = reactive({
  brandName: "陈书",
  shortName: "陈书",
  logoUrl: bundledLogoUrl,
  authWallpaperUrl: bundledWallpaperUrl,
  preferRemoteLogo: false,
  preferRemoteWallpaper: false,
  copyright: "2026 陈书",
  recoveryContact: "请联系管理员"
});

const effectiveLogoUrl = computed(() => site.logoUrl || bundledLogoUrl);
const effectiveWallpaperUrl = computed(() => site.authWallpaperUrl || bundledWallpaperUrl);
const brandTitle = computed(() => site.shortName?.trim() || "陈书");
const isCustomWallpaper = computed(() => effectiveWallpaperUrl.value !== bundledWallpaperUrl);
const contactText = computed(() => site.recoveryContact?.trim() || "请联系管理员");
const recoveryMessage = computed(() => {
  const account = username.value.trim();
  return account ? `请联系客服：${contactText.value} 重置账号 ${account}` : "";
});

async function resolvePreloadedImage(url: string, fallback: string) {
  if (await preloadImageAsset(url)) return url;
  if (url !== fallback && await preloadImageAsset(fallback)) return fallback;
  return fallback;
}

async function preparePage() {
  let nextConfig: PublicSiteConfig | null = null;
  try {
    nextConfig = withBundledSiteAssets((await getPublicSiteConfigApi()).config);
  } catch {
    nextConfig = null;
  }

  const next = nextConfig ?? site;
  const logoUrl = next.logoUrl || bundledLogoUrl;
  const wallpaperUrl = next.authWallpaperUrl || bundledWallpaperUrl;
  const [readyLogoUrl, readyWallpaperUrl] = await Promise.all([
    resolvePreloadedImage(logoUrl, bundledLogoUrl),
    resolvePreloadedImage(wallpaperUrl, bundledWallpaperUrl)
  ]);

  Object.assign(site, {
    ...next,
    logoUrl: readyLogoUrl,
    authWallpaperUrl: readyWallpaperUrl
  });
  wallpaperReady.value = true;
  assetsReady.value = true;
}

function submit() {
  submitted.value = true;
}

onMounted(() => {
  void preparePage();
});
</script>

<template>
  <main class="login-page" :class="{ 'is-ready': assetsReady, 'is-wallpaper-ready': wallpaperReady, 'is-custom-wallpaper': isCustomWallpaper }">
    <div v-if="!assetsReady" class="auth-preload" aria-label="正在载入 ChenDoc">
      <img class="auth-preload__logo" :src="effectiveLogoUrl" alt="" referrerpolicy="no-referrer" />
    </div>

    <section v-else class="auth-shell" aria-label="找回密码">
      <div class="auth-scene" aria-hidden="true">
        <img
          class="auth-scene__image"
          :src="effectiveWallpaperUrl"
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

        <section class="auth-panel" aria-label="找回密码">
          <form class="auth-card" autocomplete="off" @submit.prevent="submit">
            <div class="auth-card__header">
              <img class="auth-brand__logo" :src="effectiveLogoUrl" alt="" referrerpolicy="no-referrer" />
              <div class="auth-heading">
                <h1>{{ brandTitle }}</h1>
                <p>找回密码</p>
              </div>
            </div>

            <label class="auth-field">
              <span>账号</span>
              <div class="auth-input">
                <UserRound :size="18" />
                <input
                  v-model.trim="username"
                  autocomplete="off"
                  autocapitalize="none"
                  inputmode="text"
                  name="recovery-account"
                  placeholder="输入账号"
                  required
                  spellcheck="false"
                />
              </div>
            </label>

            <p v-if="submitted" class="auth-success" role="status">{{ recoveryMessage }}</p>

            <button class="auth-submit" type="submit">提交</button>
            <div class="auth-actions">
              <RouterLink class="auth-register-link" to="/login">返回登录</RouterLink>
            </div>
          </form>
        </section>
      </section>
    </section>
  </main>
</template>
