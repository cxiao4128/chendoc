import { onBeforeUnmount, onMounted, ref, computed } from "vue";

export type NetworkStatus = "online" | "offline" | "checking";

export function useNetworkStatus() {
  const status = ref<NetworkStatus>(navigator.onLine ? "online" : "offline");
  const lastOnlineAt = ref<number | null>(navigator.onLine ? Date.now() : null);
  const retryTimer = ref<ReturnType<typeof setInterval> | null>(null);

  function handleOnline() {
    status.value = "online";
    lastOnlineAt.value = Date.now();
    if (retryTimer.value) {
      clearInterval(retryTimer.value);
      retryTimer.value = null;
    }
  }

  function handleOffline() {
    status.value = "offline";
    // 断网后每30秒检查一次是否恢复
    retryTimer.value = setInterval(() => {
      // 浏览器会在网络恢复时触发 online 事件，这里只是备份检查
      if (navigator.onLine && status.value === "offline") {
        handleOnline();
      }
    }, 30000);
  }

  onMounted(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    if (retryTimer.value) {
      clearInterval(retryTimer.value);
    }
  });

  const isOnline = computed(() => status.value === "online");
  const isOffline = computed(() => status.value === "offline");

  return {
    status,
    lastOnlineAt,
    isOnline,
    isOffline,
  };
}