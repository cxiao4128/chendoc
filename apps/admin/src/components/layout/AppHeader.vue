<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Bell, ChevronDown, CircleHelp, LogOut, Menu, Network, Search, Sparkles, UserRound } from "lucide-vue-next";
import { useAuth } from "../../composables/useAuth";
import { useWorkspaceRoutes } from "../../composables/useWorkspaceRoutes";
import { getSystemStatusApi } from "@/services/api";
import { bundledLogoUrl as logoUrl } from "../../config/site-assets";
import { publicUrl } from "../../config/runtime";
import "./app-header.css";

defineEmits<{ menu: [] }>();
const router = useRouter();
const { base, docsPath } = useWorkspaceRoutes();
const { auth, logout } = useAuth();
const keyword = ref("");
const notificationOpen = ref(false);
const notificationLoading = ref(false);
const userMenuOpen = ref(false);
const pendingReviewCount = ref<number | null>(null);
const currentIp = computed(() => auth.user?.currentIp || "暂无 IP");

function search() {
  const value = keyword.value.trim();
  if (!value) return;
  const shareKey = value.match(/\/r\/([A-Za-z0-9_-]{3,64})/)?.[1];
  const numericShareCode = shareKey ? Number(shareKey) : 0;
  const isAdminShareCode = numericShareCode >= 111 && numericShareCode <= 9999;
  const isUserShareCode = numericShareCode >= 1_000_000 && numericShareCode <= 9_999_999;
  if (shareKey && (!/^\d+$/.test(shareKey) || isAdminShareCode || isUserShareCode)) {
    window.open(publicUrl(`/r/${shareKey}`), "_blank", "noopener,noreferrer");
    return;
  }
  router.push({ path: docsPath.value, query: { q: value } });
}

function openTemplates() {
  router.push(`${base.value}/templates`);
}

async function openNotifications() {
  userMenuOpen.value = false;
  notificationOpen.value = true;
  notificationLoading.value = true;
  try {
    pendingReviewCount.value = auth.canAccessAdmin ? (await getSystemStatusApi()).status.shares.pendingReview : 0;
  } finally {
    notificationLoading.value = false;
  }
}

function closeNotifications() {
  notificationOpen.value = false;
}

function goReview() {
  notificationOpen.value = false;
  router.push(auth.canAccessAdmin ? "/admin/share-reviews" : docsPath.value);
}

function openHelp() {
  window.open("https://github.com/cxiao4128/chendoc#readme", "_blank", "noopener,noreferrer");
}

function openProfile() {
  userMenuOpen.value = false;
  router.push(auth.canAccessAdmin ? "/admin/settings" : docsPath.value);
}

function toggleUserMenu() {
  notificationOpen.value = false;
  userMenuOpen.value = !userMenuOpen.value;
}

async function quickLogout() {
  userMenuOpen.value = false;
  await logout();
}
</script>

<template>
  <header class="app-header">
    <button class="app-header__menu" type="button" aria-label="打开导航" @click="$emit('menu')">
      <Menu :size="20" />
    </button>
    <form class="app-header__search" @submit.prevent="search">
      <Search :size="16" />
      <input v-model="keyword" aria-label="搜索文档" placeholder="搜索标题、摘要或分享编号" />
    </form>
    <div class="app-header__actions" aria-label="快捷入口">
      <button class="app-header__icon is-primary" type="button" aria-label="模板中心" @click="openTemplates">
        <Sparkles :size="18" />
      </button>
      <div class="app-header__notify">
        <button class="app-header__icon" type="button" aria-label="审核通知" @click="openNotifications">
          <Bell :size="17" />
        </button>
        <div v-if="notificationOpen" class="app-header__notification" role="dialog" aria-label="审核消息">
          <strong>审核消息</strong>
          <p v-if="notificationLoading">正在读取审核消息</p>
          <p v-else-if="pendingReviewCount">有 {{ pendingReviewCount }} 个分享需要审核</p>
          <p v-else>暂无需要审核的分享</p>
          <div>
            <button v-if="pendingReviewCount" class="cd-button primary" type="button" @click="goReview">去审核</button>
            <button class="cd-button" type="button" @click="closeNotifications">关闭</button>
          </div>
        </div>
      </div>
      <button class="app-header__icon" type="button" aria-label="帮助" @click="openHelp">
        <CircleHelp :size="17" />
      </button>
      <div class="app-header__user-menu">
        <button class="app-header__user" type="button" aria-label="当前用户" :aria-expanded="userMenuOpen" @click="toggleUserMenu">
          <span><img :src="logoUrl" alt="" /></span>
          <strong>{{ auth.user?.username || "xchen" }}</strong>
          <ChevronDown :size="15" />
        </button>
        <div v-if="userMenuOpen" class="app-header__user-popover" role="menu" aria-label="用户菜单">
          <div class="app-header__user-card">
            <span><img :src="logoUrl" alt="" /></span>
            <div>
              <strong>{{ auth.user?.username || "xchen" }}</strong>
              <small><Network :size="13" />{{ currentIp }}</small>
            </div>
          </div>
          <button type="button" role="menuitem" @click="openProfile">
            <UserRound :size="16" />账号设置
          </button>
          <button class="is-danger" type="button" role="menuitem" @click="quickLogout">
            <LogOut :size="16" />退出登录
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
