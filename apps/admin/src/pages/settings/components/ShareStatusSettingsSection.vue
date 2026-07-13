<script setup lang="ts">
import { Share2 } from "lucide-vue-next";
import type { SystemStatusView } from "@/services/api";

defineProps<{
  systemStatus: SystemStatusView | null;
}>();
</script>

<template>
  <section class="settings-page__panel">
    <div class="settings-page__panel-head">
      <div>
        <small>公开访问</small>
        <h2>分享状态</h2>
      </div>
      <RouterLink class="cd-button" to="/admin/share-reviews">
        <Share2 :size="16" />分享审核
      </RouterLink>
    </div>
    <div class="settings-page__metric-grid">
      <article><small>分享总数</small><strong>{{ systemStatus?.shares.total ?? 0 }}</strong><span>全部分享记录</span></article>
      <article><small>启用中</small><strong>{{ systemStatus?.shares.active ?? 0 }}</strong><span>当前可访问分享</span></article>
      <article><small>待审核</small><strong>{{ systemStatus?.shares.pendingReview ?? 0 }}</strong><span>需要管理员处理</span></article>
      <article><small>密码保护</small><strong>{{ systemStatus?.shares.passwordProtected ?? 0 }}</strong><span>已设置访问密码</span></article>
      <article><small>累计访问</small><strong>{{ systemStatus?.shares.totalViews ?? 0 }}</strong><span>分享页访问计数</span></article>
    </div>
  </section>
</template>
