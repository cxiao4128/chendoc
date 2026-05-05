<script setup lang="ts">
import { ref } from "vue";
import AppHeader from "./AppHeader.vue";
import AppSidebar from "./AppSidebar.vue";
import "../../pages/admin/admin-layout.css";

const sidebarOpen = ref(false);
const sidebarCollapsed = ref(false);
</script>

<template>
  <div class="admin-layout" :class="{ 'is-collapsed': sidebarCollapsed }">
    <AppSidebar
      :open="sidebarOpen"
      :collapsed="sidebarCollapsed"
      @close="sidebarOpen = false"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
    />
    <main class="admin-layout__main">
      <AppHeader @menu="sidebarOpen = true" />
      <RouterView />
    </main>
  </div>
</template>
