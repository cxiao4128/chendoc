<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Menu, Search } from "lucide-vue-next";
import "./app-header.css";

defineEmits<{ menu: [] }>();
const router = useRouter();
const keyword = ref("");

function search() {
  const value = keyword.value.trim();
  if (!value) return;
  const shareCode = value.match(/[A-Za-z0-9_-]{3,64}/)?.[0];
  if (shareCode && value.includes("/r")) {
    window.open(`/r/${shareCode}`, "_blank", "noopener,noreferrer");
    return;
  }
  router.push({ path: "/admin/docs", query: { q: value } });
}
</script>

<template>
  <header class="app-header">
    <button class="app-header__menu" type="button" aria-label="打开导航" @click="$emit('menu')">
      <Menu :size="20" />
    </button>
    <form class="app-header__search" @submit.prevent="search">
      <Search :size="16" />
      <input v-model="keyword" aria-label="搜索文档" placeholder="搜索文档，或输入 /r/111" />
    </form>
  </header>
</template>
