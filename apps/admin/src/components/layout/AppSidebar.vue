<script setup lang="ts">
import { computed } from "vue";
import { LogOut, Menu } from "lucide-vue-next";
import { useAuth } from "../../composables/useAuth";
import { useWorkspaceRoutes } from "../../composables/useWorkspaceRoutes";
import logoUrl from "../../assets/chendoc-logo.png";
import { getWorkspaceNavItems } from "./admin-nav";
import "./app-sidebar.css";

defineProps<{ open: boolean; collapsed: boolean }>();
defineEmits<{ close: []; toggleCollapse: [] }>();

const { auth, logout } = useAuth();
const { base } = useWorkspaceRoutes();
const visibleLinks = computed(() => getWorkspaceNavItems(base.value, auth.canAccessAdmin));
const roleLabel = computed(() => {
  if (auth.user?.isSuperAdmin) return "超级管理员";
  if (auth.user?.role === "admin") return "管理员";
  return "普通用户";
});
</script>

<template>
  <aside class="app-sidebar" :class="{ 'is-open': open, 'is-collapsed': collapsed }">
    <div class="app-sidebar__brand">
      <span class="app-sidebar__mark">
        <img :src="logoUrl" alt="" />
      </span>
      <div>
        <strong>ChenDoc</strong>
        <small>陈书</small>
      </div>
      <button type="button" aria-label="展开或收起导航" @click="$emit('toggleCollapse')">
        <Menu :size="17" />
      </button>
    </div>
    <nav class="app-sidebar__nav" aria-label="后台导航">
      <RouterLink v-for="item in visibleLinks" :key="item.to" :to="item.to" :title="collapsed ? item.label : undefined" @click="$emit('close')">
        <component :is="item.icon" :size="17" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
    <div class="app-sidebar__account">
      <span class="app-sidebar__account-icon">
        <img :src="logoUrl" alt="" />
      </span>
      <div>
        <strong>{{ auth.user?.username || "已登录" }}</strong>
        <small>{{ roleLabel }}</small>
      </div>
      <button type="button" title="退出登录" aria-label="退出登录" @click="logout">
        <LogOut :size="16" />
        <span>退出</span>
      </button>
    </div>
  </aside>
  <button v-if="open" class="app-sidebar__scrim" type="button" aria-label="关闭导航" @click="$emit('close')" />
</template>
