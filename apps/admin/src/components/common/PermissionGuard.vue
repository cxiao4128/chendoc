<script setup lang="ts">
import { computed } from "vue";
import { useAuthStore } from "../../stores/auth";
import ForbiddenState from "./ForbiddenState.vue";

const props = withDefaults(defineProps<{
  requireLogin?: boolean;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
  showFallback?: boolean;
}>(), {
  requireLogin: true,
  requireAdmin: false,
  requireSuperAdmin: false,
  showFallback: false
});

const auth = useAuthStore();

const allowed = computed(() => {
  if (props.requireLogin && !auth.user) return false;
  if (props.requireSuperAdmin) return auth.isSuperAdmin;
  if (props.requireAdmin) return auth.isAdmin;
  return true;
});
</script>

<template>
  <slot v-if="allowed" />
  <slot v-else name="fallback">
    <ForbiddenState v-if="showFallback" />
  </slot>
</template>
