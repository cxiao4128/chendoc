<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  getPublicShareApi,
  getPublicShareSiteConfigApi,
  PublicShareApiError,
  verifyPublicSharePasswordApi,
  type PublicShareDocument,
  type PublicShareSiteConfig
} from "@/services/api/public-share.api";
import "./public-share.css";

type PageState = "loading" | "protected" | "ready" | "error";
const bundledPublicLogoUrl = "/site-assets/chendoc-logo.webp";
const route = useRoute();
const state = ref<PageState>("loading");
const doc = ref<PublicShareDocument | null>(null);
const errorMessage = ref("");
const password = ref("");
const passwordMessage = ref("");
const verifying = ref(false);
let loadSequence = 0;

const site = reactive<PublicShareSiteConfig>({
  brandName: "陈书 / ChensDoc",
  shortName: "陈书",
  logoUrl: bundledPublicLogoUrl,
  authWallpaperUrl: "",
  preferRemoteLogo: false,
  preferRemoteWallpaper: false,
  copyright: "",
  recoveryContact: "",
  shareFooterText: ""
});

const shareKey = computed(() => String(route.params.shareKey || "").trim());
const siteName = computed(() => site.shortName?.trim() || site.brandName?.trim() || "陈书");
const shareUrl = computed(() => typeof window === "undefined" ? `/r/${shareKey.value}` : window.location.href);
const updatedText = computed(() => {
  if (!doc.value?.updatedAt) return "";
  const updatedAt = new Date(doc.value.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(updatedAt);
});
const readingMinutes = computed(() => {
  const html = doc.value?.contentHtml || "";
  const textLength = html.replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ").replace(/\s+/g, "").length;
  return Math.max(1, Math.ceil(textLength / 400));
});

function updateDocumentMeta() {
  const pageTitle = doc.value?.title || (state.value === "protected" ? "受保护的分享" : "公开分享");
  document.title = `${pageTitle} - ${siteName.value}`;
  const description = doc.value?.summary?.trim() || pageTitle;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "description";
    document.head.appendChild(meta);
  }
  meta.content = description;
}

async function loadBrand() {
  try {
    const config = (await getPublicShareSiteConfigApi()).config;
    const remoteLogo = config.preferRemoteLogo ? config.logoUrl.trim() : "";
    Object.assign(site, { ...config, logoUrl: remoteLogo || bundledPublicLogoUrl, authWallpaperUrl: "" });
    updateDocumentMeta();
  } catch {
    // Brand configuration is optional; the document must remain readable.
  }
}

function messageForError(error: unknown) {
  if (error instanceof PublicShareApiError) {
    if (error.status === 404) return "分享不存在、已关闭或已经过期。";
    return error.message;
  }
  return error instanceof Error && error.message ? error.message : "分享加载失败，请稍后重试。";
}

function applyShare(payload: Awaited<ReturnType<typeof getPublicShareApi>>) {
  if (payload.protected && !payload.unlocked) {
    doc.value = null;
    state.value = "protected";
    updateDocumentMeta();
    return;
  }

  if (typeof payload.doc?.title !== "string" || typeof payload.doc?.contentHtml !== "string") {
    throw new Error("分享正文加载失败，请刷新后重试。");
  }

  doc.value = payload.doc as PublicShareDocument;
  state.value = "ready";
  updateDocumentMeta();
}

async function loadShare() {
  const sequence = ++loadSequence;
  state.value = "loading";
  doc.value = null;
  errorMessage.value = "";
  password.value = "";
  passwordMessage.value = "";

  if (!shareKey.value || shareKey.value.length > 64) {
    state.value = "error";
    errorMessage.value = "分享链接无效。";
    return;
  }

  try {
    const payload = await getPublicShareApi(shareKey.value);
    if (sequence === loadSequence) applyShare(payload);
  } catch (error) {
    if (sequence !== loadSequence) return;
    state.value = "error";
    errorMessage.value = messageForError(error);
    updateDocumentMeta();
  }
}

async function unlockShare() {
  if (verifying.value) return;
  const input = password.value;
  if (!input) {
    passwordMessage.value = "请输入访问密码。";
    return;
  }
  if (input.length < 8) {
    passwordMessage.value = "访问密码至少需要 8 位。";
    return;
  }

  verifying.value = true;
  passwordMessage.value = "正在验证密码…";
  try {
    const verified = await verifyPublicSharePasswordApi(shareKey.value, input);
    if (!verified.ok || !verified.token) throw new Error(verified.message || "密码不正确，请重试。");
    const payload = await getPublicShareApi(shareKey.value, verified.token);
    if (!payload.unlocked) throw new Error("访问凭证无效，请重新输入密码。");
    password.value = "";
    passwordMessage.value = "";
    applyShare(payload);
  } catch (error) {
    passwordMessage.value = messageForError(error);
  } finally {
    verifying.value = false;
  }
}

void loadBrand();
watch(shareKey, () => void loadShare(), { immediate: true });
</script>

<template>
  <div class="public-share-page">
    <header class="public-share-page__topbar">
      <a class="public-share-page__brand" href="/" aria-label="返回陈书首页">
        <img :src="site.logoUrl || bundledPublicLogoUrl" alt="" width="34" height="34" decoding="async" />
        <span>{{ siteName }}</span>
      </a>
    </header>

    <main class="public-share-page__main">
      <div v-if="state === 'loading'" class="public-share-page__loading" role="status" aria-live="polite">
        <span class="public-share-page__loading-line is-title"></span>
        <span class="public-share-page__loading-line"></span>
        <span class="public-share-page__loading-line is-short"></span>
        <span class="public-share-page__sr-only">正在加载分享正文</span>
      </div>

      <template v-else-if="state === 'protected'">
        <section class="public-share-page__intro">
          <h1>受保护的分享</h1>
          <p>输入访问密码后查看正文。</p>
        </section>
        <section class="public-share-page__password-card" aria-labelledby="share-password-title">
          <div>
            <span class="public-share-page__eyebrow">分享链接</span>
            <p id="share-password-title" class="public-share-page__share-url">{{ shareUrl }}</p>
          </div>
          <form autocomplete="off" @submit.prevent="unlockShare">
            <label for="public-share-password">访问密码</label>
            <div class="public-share-page__password-row">
              <input
                id="public-share-password"
                v-model="password"
                type="password"
                name="chendoc-public-share-access-password"
                placeholder="请输入访问密码"
                autocomplete="section-public-share new-password"
                data-form-type="other"
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                :disabled="verifying"
                autofocus
              />
              <button type="submit" :disabled="verifying">
                {{ verifying ? "验证中…" : "确认密码" }}
              </button>
            </div>
            <p :class="['public-share-page__status', { 'is-error': passwordMessage && !verifying }]" aria-live="polite">
              {{ passwordMessage }}
            </p>
          </form>
        </section>
      </template>

      <template v-else-if="state === 'ready' && doc">
        <section class="public-share-page__intro">
          <h1>{{ doc.title }}</h1>
          <p v-if="doc.summary" class="public-share-page__summary">{{ doc.summary }}</p>
          <p v-if="updatedText" class="public-share-page__meta">
            更新于 {{ updatedText }} · 约 {{ readingMinutes }} 分钟阅读
          </p>
        </section>
        <img
          v-if="doc.coverUrl"
          class="public-share-page__cover"
          :src="doc.coverUrl"
          :alt="`${doc.title}封面`"
          loading="lazy"
          decoding="async"
        />
        <!-- contentHtml is sanitized by the public-share service before it leaves the server. -->
        <article v-if="doc.contentHtml" class="public-share-page__content" v-html="doc.contentHtml"></article>
        <article v-else class="public-share-page__content">
          <p class="public-share-page__empty">这篇文档还没有内容。</p>
        </article>
        <aside v-if="site.shareFooterText" class="public-share-page__footer-note" aria-label="分享页专属信息">
          <span>专属信息</span>
          <p>{{ site.shareFooterText }}</p>
        </aside>
      </template>

      <section v-else class="public-share-page__error" role="alert">
        <span class="public-share-page__eyebrow">无法打开</span>
        <h1>分享暂不可用</h1>
        <p>{{ errorMessage }}</p>
        <button type="button" @click="loadShare">重新加载</button>
      </section>
    </main>
  </div>
</template>
