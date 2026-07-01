import { onBeforeUnmount, onMounted, ref } from "vue";

export type NetworkStatus = "online" | "offline" | "checking";

export function useNetworkStatus() {
  const status = ref<NetworkStatus>(navigator.onLine ? "online" : "offline");
  const lastOnlineAt = ref<number | null>(navigator.onLine ? Date.now() : null);
  const retryTimer = ref<number | undefined>();

  function handleOnline() {
    status.value = "online";
    lastOnlineAt.value = Date.now();
    if (retryTimer.value) {
      window.clearTimeout(retryTimer.value);
      retryTimer.value = undefined;
    }
  }

  function handleOffline() {
    status.value = "offline";
    // 断网后每30秒检查一次是否恢复
    retryTimer.value = window.setInterval(() => {
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
      window.clearInterval(retryTimer.value);
    }
  });

  return {
    status,
    lastOnlineAt,
    isOnline: () => status.value === "online",
    isOffline: () => status.value === "offline",
  };
}