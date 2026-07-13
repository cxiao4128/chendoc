import { computed, ref } from "vue";
import type { NetworkStatus } from "./useNetworkStatus";

export type SyncState = "synced" | "syncing" | "pending" | "offline" | "error";

/**
 * 同步状态 composable
 * 结合网络状态和实际保存状态，提供可视化的同步指示
 */
export function useSyncState(options: {
  isDirty: () => boolean;
  isSaving: () => boolean;
  saveError: () => string | null;
  networkStatus: () => NetworkStatus;
}) {
  const lastSyncedAt = ref<number | null>(null);
  const retryCount = ref(0);

  // 核心同步状态计算
  const syncState = computed<SyncState>(() => {
    // 网络断开
    if (options.networkStatus() === "offline") {
      return "offline";
    }
    // 保存出错
    if (options.saveError()) {
      return "error";
    }
    // 正在保存
    if (options.isSaving()) {
      return "syncing";
    }
    // 有未保存内容
    if (options.isDirty()) {
      return "pending";
    }
    // 已同步
    return "synced";
  });

  // 状态描述文字
  const syncText = computed(() => {
    switch (syncState.value) {
      case "synced":
        return lastSyncedAt.value ? `已同步 ${formatTimeAgo(lastSyncedAt.value)}` : "已同步";
      case "syncing":
        return "同步中...";
      case "pending":
        return "待同步";
      case "offline":
        return "离线模式";
      case "error":
        return "同步失败";
      default:
        return "";
    }
  });

  // 标记已同步（成功保存后调用）
  function markSynced() {
    lastSyncedAt.value = Date.now();
    retryCount.value = 0;
  }

  // 标记重试次数（失败时调用）
  function markRetry(count: number) {
    retryCount.value = count;
  }

  // 获取重试次数
  function getRetryCount() {
    return retryCount.value;
  }

  return {
    syncState,
    syncText,
    lastSyncedAt,
    retryCount,
    markSynced,
    markRetry,
    getRetryCount,
  };
}

// 格式化相对时间
function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}