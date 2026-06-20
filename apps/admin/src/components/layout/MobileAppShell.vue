<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Bell, BookOpen, ChevronRight, LogOut, Menu, Plus, UserRound, X } from "lucide-vue-next";
import { useAuth } from "../../composables/useAuth";
import { useWorkspaceRoutes } from "../../composables/useWorkspaceRoutes";
import { useDocStore } from "../../stores/doc";
import { bundledLogoUrl as logoUrl } from "../../config/site-assets";
import SessionStatusBanner from "./SessionStatusBanner.vue";
import { getAdminRouteMeta, getWorkspaceNavItems, isAdminNavActive } from "./admin-nav";
import "./mobile-app-shell.css";

const route = useRoute();
const router = useRouter();
const docs = useDocStore();
const { auth, logout } = useAuth();
const { base, docsPath, docPath } = useWorkspaceRoutes();
const drawerOpen = ref(false);

const appTitle = "陈书";
const routeMeta = computed(() => getAdminRouteMeta(route.path));
const isEditorRoute = computed(() => /^\/(?:admin|users)\/docs\/[A-Za-z0-9]{16,32}/.test(route.path));
const visibleLinks = computed(() => getWorkspaceNavItems(base.value, auth.canAccessAdmin));
const roleText = computed(() => {
  if (auth.user?.isSuperAdmin) return "超级管理员";
  if (auth.user?.role === "admin") return "管理员";
  return "普通用户";
});
const workspaceTabs = computed(() => visibleLinks.value.slice(0, 4));
const isDocsHomeRoute = computed(() => /^\/(?:admin|users)\/docs\/?$/.test(route.path));
const currentUserName = computed(() => auth.user?.username || "ChenDoc");

watch(() => route.fullPath, () => {
  drawerOpen.value = false;
});

function activeNav(path: string) {
  return isAdminNavActive(route.path, path);
}

async function createDoc() {
  const doc = await docs.createDoc("未命名文档");
  drawerOpen.value = false;
  router.push(docPath(doc.docUid));
}
</script>

<template>
  <div class="mobile-shell" :class="{ 'is-editor-route': isEditorRoute }">
    <SessionStatusBanner />
    <template v-if="isEditorRoute">
      <RouterView />
    </template>

    <template v-else>
      <header class="mobile-shell__header" :class="{ 'is-docs-home': isDocsHomeRoute }">
        <div v-if="isDocsHomeRoute" class="mobile-shell__homebar">
          <div class="mobile-shell__profile">
            <img :src="logoUrl" alt="" />
            <div>
              <strong>{{ currentUserName }}</strong>
              <small>{{ roleText }}</small>
            </div>
          </div>
          <div class="mobile-shell__header-actions">
            <button class="mobile-shell__action" type="button" aria-label="通知">
              <Bell :size="18" />
            </button>
            <button class="mobile-shell__action" type="button" aria-label="打开账号与导航面板" @click="drawerOpen = true">
              <Menu :size="18" />
            </button>
          </div>
        </div>

        <div v-else class="mobile-shell__subbar">
          <div class="mobile-shell__subcopy">
            <small>{{ routeMeta.eyebrow }}</small>
            <strong>{{ routeMeta.title }}</strong>
          </div>
          <div class="mobile-shell__header-actions">
            <RouterLink class="mobile-shell__action" :to="docsPath" aria-label="返回文档">
              <BookOpen :size="18" />
            </RouterLink>
            <button class="mobile-shell__action" type="button" aria-label="打开账号与导航面板" @click="drawerOpen = true">
              <Menu :size="18" />
            </button>
          </div>
        </div>
      </header>

      <main class="mobile-shell__content">
        <RouterView />
      </main>

      <button class="mobile-shell__fab" type="button" aria-label="新建文档" @click="createDoc">
        <Plus :size="24" />
      </button>

      <nav class="mobile-shell__tabbar" aria-label="移动端主导航">
        <RouterLink
          v-for="item in workspaceTabs"
          :key="item.to"
          class="mobile-shell__tab"
          :class="{ 'is-active': activeNav(item.to) }"
          :to="item.to"
        >
          <component :is="item.icon" :size="21" />
          <span>{{ item.label }}</span>
        </RouterLink>

        <button class="mobile-shell__tab" :class="{ 'is-active': drawerOpen }" type="button" @click="drawerOpen = true">
          <UserRound :size="21" />
          <span>我</span>
        </button>
      </nav>

      <button v-if="drawerOpen" class="mobile-shell__scrim" type="button" aria-label="关闭面板" @click="drawerOpen = false" />

      <aside class="mobile-shell__drawer" :class="{ 'is-open': drawerOpen }" aria-label="移动端账号与导航面板">
        <div class="mobile-shell__drawer-head">
          <div class="mobile-shell__drawer-brand">
            <span class="mobile-shell__drawer-logo">
              <img :src="logoUrl" alt="" />
            </span>
            <div>
              <strong>{{ appTitle }}</strong>
              <small>{{ roleText }}</small>
            </div>
          </div>
          <button class="mobile-shell__action" type="button" aria-label="关闭面板" @click="drawerOpen = false">
            <X :size="18" />
          </button>
        </div>

        <section class="mobile-shell__account">
          <div>
            <small>当前账号</small>
            <strong>{{ auth.user?.username || "已登录" }}</strong>
            <span>{{ roleText }}</span>
          </div>
          <img :src="logoUrl" alt="" />
        </section>

        <button class="mobile-shell__quick-create" type="button" @click="createDoc">
          <Plus :size="18" />
          <span>马上新建文档</span>
        </button>

        <div class="mobile-shell__nav-list">
          <RouterLink
            v-for="item in visibleLinks"
            :key="item.to"
            class="mobile-shell__nav-link"
            :class="{ 'is-active': activeNav(item.to) }"
            :to="item.to"
          >
            <div class="mobile-shell__nav-copy">
              <component :is="item.icon" :size="18" />
              <span>{{ item.label }}</span>
            </div>
            <ChevronRight :size="16" />
          </RouterLink>
        </div>

        <button class="mobile-shell__logout" type="button" @click="logout">
          <LogOut :size="18" />
          <span>退出登录</span>
        </button>
      </aside>
    </template>
  </div>
</template>
