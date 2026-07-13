<script setup lang="ts">
import { RefreshCw, Trash2 } from "lucide-vue-next";
import type { SystemAction, SystemStatusView } from "@/services/api";

defineProps<{
  systemStatus: SystemStatusView | null;
  systemLoading: boolean;
  systemActionLoading: SystemAction | "export" | null;
  systemMessage: string;
}>();

defineEmits<{
  refresh: [];
  runAction: [action: SystemAction];
}>();
</script>

<template>
  <section class="settings-page__panel">
    <div class="settings-page__panel-head">
      <div>
        <small>登录与验证码</small>
        <h2>安全状态</h2>
      </div>
      <button class="cd-button" type="button" :disabled="systemLoading" @click="$emit('refresh')">
        <RefreshCw :size="16" />{{ systemLoading ? "刷新中" : "刷新" }}
      </button>
    </div>
    <div class="settings-page__metric-grid">
      <article><small>活跃会话</small><strong>{{ systemStatus?.security.activeSessions ?? 0 }}</strong><span>当前仍可使用的登录会话</span></article>
      <article><small>过期会话</small><strong>{{ systemStatus?.security.expiredSessions ?? 0 }}</strong><span>可安全清理</span></article>
      <article><small>有效验证码</small><strong>{{ systemStatus?.security.activeCaptchas ?? 0 }}</strong><span>仍在有效期内</span></article>
      <article><small>过期/已用验证码</small><strong>{{ systemStatus?.security.staleCaptchas ?? 0 }}</strong><span>可安全清理</span></article>
    </div>
    <div class="settings-page__panel-actions">
      <button class="cd-button" type="button" :disabled="!!systemActionLoading" @click="$emit('runAction', 'cleanupExpiredSessions')">
        <Trash2 :size="16" />{{ systemActionLoading === "cleanupExpiredSessions" ? "清理中" : "清理过期会话" }}
      </button>
      <button class="cd-button" type="button" :disabled="!!systemActionLoading" @click="$emit('runAction', 'cleanupExpiredCaptchas')">
        <Trash2 :size="16" />{{ systemActionLoading === "cleanupExpiredCaptchas" ? "清理中" : "清理验证码" }}
      </button>
    </div>
    <p v-if="systemMessage" class="settings-page__save-message">{{ systemMessage }}</p>
  </section>
</template>
