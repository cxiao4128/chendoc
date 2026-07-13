<script setup lang="ts">
import { CloudUpload } from "lucide-vue-next";
import type { SystemStatusView } from "@/services/api";

defineProps<{
  systemStatus: SystemStatusView | null;
  formatBytes: (value?: number) => string;
}>();
</script>

<template>
  <section class="settings-page__panel">
    <div class="settings-page__panel-head">
      <div>
        <small>上传记录</small>
        <h2>存储概览</h2>
      </div>
      <RouterLink class="cd-button" to="/admin/settings/storage">
        <CloudUpload :size="16" />R2 设置
      </RouterLink>
    </div>
    <div class="settings-page__metric-grid">
      <article><small>登记文件</small><strong>{{ systemStatus?.storage.fileCount ?? 0 }}</strong><span>上传记录总数</span></article>
      <article><small>登记大小</small><strong>{{ formatBytes(systemStatus?.storage.totalBytes || 0) }}</strong><span>来自上传表 file_size</span></article>
      <article><small>图片</small><strong>{{ systemStatus?.storage.byKind.image ?? 0 }}</strong><span>image 类型</span></article>
      <article><small>视频</small><strong>{{ systemStatus?.storage.byKind.video ?? 0 }}</strong><span>video 类型</span></article>
      <article><small>文件</small><strong>{{ systemStatus?.storage.byKind.file ?? 0 }}</strong><span>file 类型</span></article>
    </div>
    <div class="settings-page__storage-note">
      <strong>R2：{{ systemStatus?.r2.configured ? "已配置" : "未完整配置" }}</strong>
      <span>{{ systemStatus?.r2.message || "等待状态刷新" }}</span>
      <code v-if="systemStatus?.r2.bucket">{{ systemStatus.r2.bucket }}</code>
    </div>
  </section>
</template>
