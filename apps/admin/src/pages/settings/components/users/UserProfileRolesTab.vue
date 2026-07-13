<script setup lang="ts">
import { CheckCircle2, Database, LockKeyhole, ScrollText, ShieldCheck, Trash2, UserCog } from "lucide-vue-next";
import type { ManagedUserView } from "@/services/api";

defineProps<{
  selectedUser: ManagedUserView;
  userActionLoading: number | null;
  roleText: (user: Pick<ManagedUserView, "role" | "isSuperAdmin">) => string;
  canPromoteUser: (user: ManagedUserView) => boolean;
  canManageUser: (user: ManagedUserView) => boolean;
}>();

defineEmits<{
  promoteUser: [user: ManagedUserView];
  disableUser: [user: ManagedUserView];
  enableUser: [user: ManagedUserView];
  deleteUser: [user: ManagedUserView];
}>();
</script>

<template>
  <section class="settings-page__tab-panel">
    <header class="settings-page__tab-panel-head">
      <div>
        <small>当前角色</small>
        <h3>{{ roleText(selectedUser) }}</h3>
        <p>角色来自后端数据库强校验，前端只负责展示和触发管理员操作。</p>
      </div>
      <button v-if="selectedUser.role !== 'admin'" class="cd-button primary" type="button" :disabled="!canPromoteUser(selectedUser) || userActionLoading === selectedUser.id" @click="$emit('promoteUser', selectedUser)">
        <ShieldCheck :size="16" />提级管理员
      </button>
    </header>
    <div class="settings-page__permission-grid">
      <article>
        <ShieldCheck :size="20" />
        <strong>后台访问</strong>
        <span>{{ selectedUser.role === "admin" ? "可进入 /admin，并经过数据库角色校验。" : "不可进入后台管理页。" }}</span>
      </article>
      <article>
        <UserCog :size="20" />
        <strong>用户管理</strong>
        <span>{{ selectedUser.role === "admin" ? "可查看用户；高危操作需要二次验证。" : "无用户管理权限。" }}</span>
      </article>
      <article>
        <ScrollText :size="20" />
        <strong>日志审计</strong>
        <span>{{ selectedUser.role === "admin" ? "可查看操作日志和系统事件。" : "无审计日志权限。" }}</span>
      </article>
      <article>
        <Database :size="20" />
        <strong>系统配置</strong>
        <span>{{ selectedUser.isSuperAdmin ? "可管理 R2、系统设置和导出配置。" : "仅超级管理员可改系统配置。" }}</span>
      </article>
    </div>
    <div class="settings-page__role-actions">
      <button v-if="selectedUser.status === 'active'" class="cd-button" type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="$emit('disableUser', selectedUser)">
        <LockKeyhole :size="16" />禁止登录
      </button>
      <button v-else class="cd-button" type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="$emit('enableUser', selectedUser)">
        <CheckCircle2 :size="16" />恢复登录
      </button>
      <button class="cd-button danger" type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="$emit('deleteUser', selectedUser)">
        <Trash2 :size="16" />注销用户
      </button>
    </div>
  </section>
</template>
