<script setup lang="ts">
import { ExternalLink, Github, RefreshCw } from "lucide-vue-next";
import type { UpdateState } from "../../../features/settings/hooks/useVersionCheck";

defineProps<{
  currentVersion: string;
  versionStatusText: string;
  updateState: UpdateState;
  repoUrl: string;
}>();

defineEmits<{
  checkUpdate: [];
}>();
</script>

<template>
  <section class="settings-page__version">
    <div class="settings-page__version-copy">
      <small>当前版本</small>
      <strong>{{ currentVersion }}</strong>
      <span>{{ versionStatusText }}</span>
    </div>
    <div class="settings-page__version-actions">
      <button class="cd-button primary" type="button" :disabled="updateState === 'checking'" @click="$emit('checkUpdate')">
        <RefreshCw :size="16" />{{ updateState === "checking" ? "检查中" : "检查更新" }}
      </button>
      <a class="cd-button" :href="repoUrl" target="_blank" rel="noopener noreferrer">
        <Github :size="16" />开源链接
      </a>
      <a class="cd-button" :href="`${repoUrl}/releases`" target="_blank" rel="noopener noreferrer">
        <ExternalLink :size="16" />发布页
      </a>
    </div>
  </section>
</template>
