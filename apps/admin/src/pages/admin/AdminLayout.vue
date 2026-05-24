<script setup lang="ts">
import DesktopAppShell from "../../components/layout/DesktopAppShell.vue";
import MobileAppShell from "../../components/layout/MobileAppShell.vue";
import { useIsMobileViewport } from "../../composables/useViewport";
import "../reviews/share-review.css";

const isMobile = useIsMobileViewport();
</script>

<template>
  <MobileAppShell v-if="isMobile" />
  <DesktopAppShell v-else />
</template>
