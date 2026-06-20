<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { CheckCircle2, Clock3, TriangleAlert } from "lucide-vue-next";
import "./session-status-banner.css";

type SessionStatus = "expiring" | "restored" | "failed";

const status = ref<SessionStatus | null>(null);
let hideTimer: number | undefined;

function onSessionStatus(event: Event) {
  const next = (event as CustomEvent<{ status?: SessionStatus }>).detail?.status;
  if (!next) return;
  status.value = next;
  if (hideTimer) window.clearTimeout(hideTimer);
  if (next === "restored") {
    hideTimer = window.setTimeout(() => { status.value = null; }, 4000);
  }
}

onMounted(() => window.addEventListener("chendoc:session-status", onSessionStatus));
onBeforeUnmount(() => {
  window.removeEventListener("chendoc:session-status", onSessionStatus);
  if (hideTimer) window.clearTimeout(hideTimer);
});
</script>

<template>
  <div v-if="status" class="session-status-banner" :class="`is-${status}`" role="status" aria-live="polite">
    <Clock3 v-if="status === 'expiring'" :size="16" />
    <CheckCircle2 v-else-if="status === 'restored'" :size="16" />
    <TriangleAlert v-else :size="16" />
    <span v-if="status === 'expiring'">会话即将过期，正在续期</span>
    <span v-else-if="status === 'restored'">会话已恢复，可继续编辑</span>
    <span v-else>会话续期未完成，请保存后重新登录</span>
  </div>
</template>
