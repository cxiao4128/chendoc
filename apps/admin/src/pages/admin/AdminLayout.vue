<script setup lang="ts">
import DesktopAppShell from "../../components/layout/DesktopAppShell.vue";
import MobileAppShell from "../../components/layout/MobileAppShell.vue";
import { useIsMobileViewport } from "../../composables/useViewport";

const isMobile = useIsMobileViewport();
</script>

<template>
  <MobileAppShell v-if="isMobile" />
  <DesktopAppShell v-else />
</template>
