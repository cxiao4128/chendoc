<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-vue-next";
import { useLoginPage } from "./useLoginPage";
import "./css/login.css";

const {
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
} = useLoginPage();
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
            <h1 aria-hidden="true">陈书</h1>
            <strong>ChenDoc 文档系统</strong>
            <span></span>
          </div>
          <small class="auth-hero__copyright">© 2026 ChenDoc. All rights reserved.</small>
        </section>

        <section class="auth-panel" aria-label="登录">
          <form class="auth-card" :aria-busy="loading" autocomplete="on" @submit.prevent="submit">
            <div class="auth-card__header">
              <img class="auth-brand__logo" :src="effectiveLogoUrl" alt="" referrerpolicy="no-referrer" />
              <div class="auth-heading">
                <h1 class="auth-heading__title">{{ brandTitle }}</h1>
                <p class="auth-heading__subtitle">文档管理平台</p>
              </div>
            </div>

            <label class="auth-field">
              <span>用户名</span>
              <div class="auth-input">
                <UserRound :size="18" />
                <input
                  v-model.trim="username"
                  :aria-describedby="error ? 'login-error' : undefined"
                  :aria-invalid="Boolean(error)"
                  autocomplete="username"
                  autocapitalize="none"
                  inputmode="text"
                  name="username"
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
                  :aria-describedby="error ? 'login-error' : undefined"
                  :aria-invalid="Boolean(error)"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  name="password"
                  placeholder="密码"
                  required
                />
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

            <p v-if="error" id="login-error" class="cd-error" role="alert">{{ error }}</p>
            <p v-if="successMessage" class="auth-success" role="status">{{ successMessage }}</p>

            <button class="auth-submit" type="submit" :aria-busy="loading" :disabled="loading">
              {{ loading ? "登录中" : "进入陈书" }}
            </button>
          </form>
        </section>
      </section>
    </section>
  </main>
</template>
