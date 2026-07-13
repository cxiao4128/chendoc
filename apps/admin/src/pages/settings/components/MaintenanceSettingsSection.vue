<script setup lang="ts">
import { Activity, Database, ExternalLink, RefreshCw, Trash2 } from "lucide-vue-next";
import type { SystemAction, SystemStatusView } from "@/services/api";

defineProps<{
  systemStatus: SystemStatusView | null;
  systemActionLoading: SystemAction | "export" | null;
  systemMessage: string;
  formatLogDate: (value: string) => string;
  formatBytes: (value?: number) => string;
}>();

defineEmits<{
  runAction: [action: SystemAction];
  exportConfig: [];
}>();
</script>

<template>
  <section class="settings-page__panel">
    <div class="settings-page__panel-head">
      <div>
        <small>手动维护</small>
        <h2>系统维护</h2>
      </div>
      <button class="cd-button" type="button" :disabled="systemActionLoading === 'healthCheck'" @click="$emit('runAction', 'healthCheck')">
        <Activity :size="16" />{{ systemActionLoading === "healthCheck" ? "检测中" : "健康检测" }}
      </button>
    </div>
    <div class="settings-page__quick settings-page__quick--panel">
      <button type="button" :disabled="!!systemActionLoading" @click="$emit('runAction', 'cleanupExpiredSessions')"><Trash2 :size="18" /><span><strong>清理过期会话</strong><small>删除过期登录会话</small></span></button>
      <button type="button" :disabled="!!systemActionLoading" @click="$emit('runAction', 'cleanupExpiredCaptchas')"><Activity :size="18" /><span><strong>清理验证码</strong><small>删除过期/已用验证码</small></span></button>
      <button type="button" :disabled="!!systemActionLoading" @click="$emit('runAction', 'cleanupExpiredLogs')"><Trash2 :size="18" /><span><strong>清理过期日志</strong><small>按配置保留天数删除日志</small></span></button>
      <button type="button" :disabled="!!systemActionLoading" @click="$emit('runAction', 'emptyTrash')"><Trash2 :size="18" /><span><strong>清理回收站</strong><small>永久删除回收站文档</small></span></button>
      <button type="button" :disabled="!!systemActionLoading" @click="$emit('runAction', 'refreshStatus')"><Database :size="18" /><span><strong>刷新运行状态</strong><small>重新读取实时统计</small></span></button>
      <button type="button" :disabled="!!systemActionLoading" @click="$emit('exportConfig')"><ExternalLink :size="18" /><span><strong>导出系统配置</strong><small>下载脱敏配置 JSON</small></span></button>
      <button type="button" :disabled="!!systemActionLoading" @click="$emit('runAction', 'healthCheck')"><RefreshCw :size="18" /><span><strong>系统健康检测</strong><small>检查 API、DB、R2 配置</small></span></button>
    </div>
    <div class="settings-page__storage-note">
      <strong>最近成功备份</strong>
      <span v-if="systemStatus?.backup">{{ formatLogDate(systemStatus.backup.createdAt) }} · {{ formatBytes(systemStatus.backup.size) }}</span>
      <span v-else>尚无带校验和的成功备份记录</span>
      <code v-if="systemStatus?.backup">SHA-256 {{ systemStatus.backup.sha256.slice(0, 16) }}...</code>
    </div>
    <p v-if="systemMessage" class="settings-page__save-message">{{ systemMessage }}</p>
  </section>
</template>
