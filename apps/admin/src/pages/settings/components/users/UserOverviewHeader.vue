<script setup lang="ts">
import { Ban, CheckCircle2, RefreshCw, ShieldCheck, UserCog } from "lucide-vue-next";

interface ManagedUserStats {
  total: number;
  active: number;
  admins: number;
  disabled: number;
  docs: number;
}

defineProps<{
  usersLoading: boolean;
  managedUserStats: ManagedUserStats;
}>();

defineEmits<{
  refreshUsers: [force: boolean];
  openPanel: [panel: "security" | "logs"];
}>();
</script>

<template>
  <div class="settings-page__users-hero">
    <div>
      <small>用户与权限</small>
      <h2>用户管理</h2>
      <p>管理系统用户账户、角色权限及状态。</p>
    </div>
    <button class="cd-button primary" type="button" :disabled="usersLoading" @click="$emit('refreshUsers', true)">
      <RefreshCw :size="16" />{{ usersLoading ? "刷新中" : "刷新用户" }}
    </button>
  </div>

  <div class="settings-page__user-subtabs" aria-label="用户管理分类">
    <button class="is-active" type="button">用户列表</button>
    <button type="button" @click="$emit('openPanel', 'security')">角色安全</button>
    <button type="button" @click="$emit('openPanel', 'logs')">登录日志</button>
  </div>

  <div class="settings-page__user-stat-grid">
    <article><UserCog :size="22" /><span><small>用户总数</small><strong>{{ managedUserStats.total }}</strong><em>文档 {{ managedUserStats.docs }} 篇</em></span></article>
    <article><CheckCircle2 :size="22" /><span><small>活跃用户</small><strong>{{ managedUserStats.active }}</strong><em>可正常登录</em></span></article>
    <article><ShieldCheck :size="22" /><span><small>管理员</small><strong>{{ managedUserStats.admins }}</strong><em>含超级管理员</em></span></article>
    <article><Ban :size="22" /><span><small>被禁用户</small><strong>{{ managedUserStats.disabled }}</strong><em>已禁止登录</em></span></article>
  </div>
</template>
