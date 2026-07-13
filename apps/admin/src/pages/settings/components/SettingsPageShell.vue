<script setup lang="ts">
import {
  Activity,
  Database,
  ExternalLink,
  KeyRound,
  Paintbrush,
  RefreshCw,
  ShieldCheck,
  ScrollText,
  Share2,
  Trash2,
  UserCog,
  Wrench
} from "lucide-vue-next";
import type { SettingsPanel } from "../settings.types";

defineProps<{
  isMobile: boolean;
  activePanel: SettingsPanel;
  systemLoading: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  openPanel: [panel: SettingsPanel];
}>();

function openPanel(panel: SettingsPanel) {
  emit("openPanel", panel);
}
</script>

<template>
  <section class="settings-page" :class="{ 'is-mobile': isMobile }">
    <header class="settings-page__head">
      <div>
        <h1>系统管理中心</h1>
        <p>查看实时状态、用户、日志、外观和维护动作。</p>
      </div>
      <button class="cd-button" type="button" :disabled="systemLoading" @click="emit('refresh')">
        <RefreshCw :size="16" />{{ systemLoading ? "刷新中" : "刷新" }}
      </button>
    </header>

    <nav class="settings-page__tabs" aria-label="系统管理导航">
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'overview' }" type="button" @click="openPanel('overview')">
        <Activity :size="16" />概览
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'users' }" type="button" @click="openPanel('users')">
        <UserCog :size="16" />用户与权限
      </button>
      <RouterLink class="settings-page__tab settings-page__tab--link" to="/admin/invites">
        <KeyRound :size="16" />注册卡密
      </RouterLink>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'security' }" type="button" @click="openPanel('security')">
        <ShieldCheck :size="16" />安全策略
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'shares' }" type="button" @click="openPanel('shares')">
        <Share2 :size="16" />分享管理
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'storage' }" type="button" @click="openPanel('storage')">
        <Database :size="16" />存储与 R2
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'appearance' }" type="button" @click="openPanel('appearance')">
        <Paintbrush :size="16" />站点外观
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'recovery' }" type="button" @click="openPanel('recovery')">
        <KeyRound :size="16" />账号找回
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'logs' }" type="button" @click="openPanel('logs')">
        <ScrollText :size="16" />日志审计
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'maintenance' }" type="button" @click="openPanel('maintenance')">
        <Wrench :size="16" />系统维护
      </button>
      <RouterLink class="settings-page__tab settings-page__tab--link" to="/admin/article-delete">
        <Trash2 :size="16" />文档删除
      </RouterLink>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'version' }" type="button" @click="openPanel('version')">
        <ExternalLink :size="16" />版本更新
      </button>
    </nav>

    <slot />
  </section>
</template>
