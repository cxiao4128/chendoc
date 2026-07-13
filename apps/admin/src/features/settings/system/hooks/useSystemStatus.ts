/**
 * features/settings/system/hooks/useSystemStatus.ts
 * 系统状态 hooks（合并 useSystemStatus + useSystemMaintenance）
 */
import { computed, ref } from "vue";
import type { SystemAction, SystemStatusView } from "../../../../services/api/settings.api";
import { settingsApi } from "../../../../services/api/settings.api";
import { nativeConfirm } from "../../../../services/nativeDialog";

export function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

export function formatUptime(seconds = 0) {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时 ${minutes % 60} 分钟`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

export interface UseSystemStatusOptions {
  afterMutating?: () => Promise<void> | void;
}

export function useSystemStatus(options: UseSystemStatusOptions = {}) {
  const systemStatus = ref<SystemStatusView | null>(null);
  const systemLoading = ref(false);
  const systemMessage = ref("");
  const systemActionLoading = ref<SystemAction | "export" | null>(null);

  const storageUsagePercent = computed(() => {
    const usedBytes = systemStatus.value?.storage.totalBytes || 0;
    const quotaBytes = 10 * 1024 * 1024 * 1024;
    return Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10);
  });

  const securitySummaryText = computed(() => {
    const security = systemStatus.value?.security;
    if (!security) return "等待安全状态刷新";
    if (security.expiredSessions || security.staleCaptchas) return "有可清理项";
    return "会话与验证码正常";
  });

  async function loadSystemStatus() {
    systemLoading.value = true;
    try {
      systemStatus.value = (await settingsApi.status()).status;
    } finally {
      systemLoading.value = false;
    }
  }

  function logTrendText() {
    const logs = systemStatus.value?.logs;
    if (!logs) return "等待实时统计";
    if (!logs.delta) return "与昨日持平";
    const sign = logs.delta > 0 ? "+" : "";
    return `较昨日 ${sign}${logs.delta}（${sign}${logs.deltaPercent}%）`;
  }

  async function runSystemAction(action: SystemAction) {
    const currentStatus = systemStatus.value;
    const confirmations: Partial<Record<SystemAction, { title: string; message: string; confirmText: string; danger?: boolean }>> = {
      cleanupExpiredSessions: {
        title: "清理过期会话",
        message: `将删除 ${currentStatus?.security.expiredSessions ?? 0} 个已过期登录会话。有效会话不受影响。`,
        confirmText: "确认清理"
      },
      cleanupExpiredCaptchas: {
        title: "清理验证码",
        message: `将删除 ${currentStatus?.security.staleCaptchas ?? 0} 个已过期或已使用验证码。删除后不可恢复。`,
        confirmText: "确认清理"
      },
      cleanupExpiredLogs: {
        title: "清理过期日志",
        message: "将永久删除超过系统保留期限的登录日志和操作日志；保留期限内日志不受影响。",
        confirmText: "永久清理",
        danger: true
      },
      emptyTrash: {
        title: "清空回收站",
        message: `将永久删除回收站内 ${currentStatus?.docs.trash ?? 0} 篇文档。该操作不可撤销。`,
        confirmText: "永久清理",
        danger: true
      }
    };
    const confirmation = confirmations[action];
    if (confirmation) {
      const confirmed = await nativeConfirm({ ...confirmation });
      if (!confirmed) return;
    }
    systemActionLoading.value = action;
    systemMessage.value = "";
    try {
      const result = (await settingsApi.runAction(action)).result;
      systemMessage.value = result.message;
      if (action !== "refreshStatus" && action !== "healthCheck") {
        if (result.status) systemStatus.value = result.status;
        else await loadSystemStatus();
        await options.afterMutating?.();
      }
    } finally {
      systemActionLoading.value = null;
    }
  }

  async function exportConfig() {
    const confirmed = await nativeConfirm({
      title: "导出系统配置",
      message: "将下载站点配置、脱敏 R2 配置、系统设置和运行统计。密钥及数据库密码不会导出。",
      confirmText: "确认导出"
    });
    if (!confirmed) return;
    systemActionLoading.value = "export";
    systemMessage.value = "";
    try {
      const payload = (await settingsApi.exportConfig()).export;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `chendoc-system-config-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      systemMessage.value = "系统配置已导出";
    } finally {
      systemActionLoading.value = null;
    }
  }

  return {
    systemStatus,
    systemLoading,
    systemMessage,
    systemActionLoading,
    storageUsagePercent,
    securitySummaryText,
    loadSystemStatus,
    logTrendText,
    runSystemAction,
    exportConfig,
    formatBytes,
    formatUptime
  };
}
