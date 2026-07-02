/**
 * useDocSchedule.ts - 定时发布管理 Composable
 *
 * 职责：
 * - 定时发布时间管理
 * - 草稿过期设置
 * - 自动归档开关
 */
import { ref, readonly, computed } from "vue";
import {
  getDocScheduleApi,
  setDocScheduleApi,
  deleteDocScheduleApi,
  type DocSchedule,
} from "../api/docs";

export interface ScheduleInput {
  scheduledAt?: string | null;
  expiresAt?: string | null;
  autoArchive?: boolean;
}

export interface UseDocScheduleOptions {
  /** 保存成功回调 */
  onSaved?: (schedule: DocSchedule | null) => void;
  /** 清除成功回调 */
  onCleared?: () => void;
  /** 错误回调 */
  onError?: (error: Error, operation: "load" | "save" | "clear") => void;
}

export function useDocSchedule(options: UseDocScheduleOptions = {}) {
  // 状态
  const schedule = ref<DocSchedule | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  // ============= 计算属性 =============
  const isScheduled = computed(() => !!schedule.value?.scheduledAt);
  const isExpiring = computed(() => !!schedule.value?.expiresAt);
  const hasAutoArchive = computed(() => !!schedule.value?.autoArchive);

  const scheduledAtLocal = computed(() => {
    if (!schedule.value?.scheduledAt) return "";
    return schedule.value.scheduledAt.slice(0, 16);
  });

  const expiresAtLocal = computed(() => {
    if (!schedule.value?.expiresAt) return "";
    return schedule.value.expiresAt.slice(0, 16);
  });

  // ============= 加载定时设置 =============
  async function loadSchedule(docUid: string): Promise<DocSchedule | null> {
    loading.value = true;
    error.value = null;

    try {
      const response = await getDocScheduleApi(docUid);
      schedule.value = response.schedule;
      return response.schedule;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e.message;
      options.onError?.(e, "load");
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // ============= 保存定时设置 =============
  async function saveSchedule(
    docUid: string,
    input: ScheduleInput
  ): Promise<DocSchedule | null> {
    saving.value = true;
    error.value = null;

    try {
      const response = await setDocScheduleApi(docUid, {
        scheduledAt: input.scheduledAt,
        expiresAt: input.expiresAt,
        autoArchive: input.autoArchive,
      });
      schedule.value = response.schedule;
      options.onSaved?.(response.schedule);
      return response.schedule;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e.message;
      options.onError?.(e, "save");
      throw e;
    } finally {
      saving.value = false;
    }
  }

  // ============= 清除定时设置 =============
  async function clearSchedule(docUid: string): Promise<void> {
    saving.value = true;
    error.value = null;

    try {
      await deleteDocScheduleApi(docUid);
      schedule.value = null;
      options.onCleared?.();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e.message;
      options.onError?.(e, "clear");
      throw e;
    } finally {
      saving.value = false;
    }
  }

  // ============= 快捷方法 =============
  async function setScheduledAt(docUid: string, value: string | null): Promise<void> {
    await saveSchedule(docUid, {
      scheduledAt: value ? new Date(value).toISOString() : null,
    });
  }

  async function setExpiresAt(docUid: string, value: string | null): Promise<void> {
    await saveSchedule(docUid, {
      expiresAt: value ? new Date(value).toISOString() : null,
    });
  }

  async function setAutoArchive(docUid: string, enabled: boolean): Promise<void> {
    await saveSchedule(docUid, { autoArchive: enabled });
  }

  async function toggleScheduledAt(docUid: string): Promise<void> {
    if (schedule.value?.scheduledAt) {
      await clearSchedule(docUid);
    } else {
      const now = new Date();
      now.setDate(now.getDate() + 7); // 默认一周后
      await setScheduledAt(docUid, now.toISOString());
    }
  }

  // ============= 格式化 =============
  function formatDate(isoString: string | null | undefined): string {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatRelativeTime(isoString: string | null | undefined): string {
    if (!isoString) return "";
    const d = new Date(isoString);
    const now = Date.now();
    const diff = d.getTime() - now;

    if (diff < 0) {
      return "已过期";
    }

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) {
      return `${minutes} 分钟后`;
    } else if (hours < 24) {
      return `${hours} 小时后`;
    } else {
      return `${days} 天后`;
    }
  }

  // ============= 重置状态 =============
  function reset(): void {
    schedule.value = null;
    loading.value = false;
    saving.value = false;
    error.value = null;
  }

  // ============= 导出 =============
  return {
    // 状态（只读）
    schedule: readonly(schedule),
    loading: readonly(loading),
    saving: readonly(saving),
    error: readonly(error),

    // 可修改的状态
    scheduleRef: schedule,
    errorRef: error,

    // 计算属性
    isScheduled,
    isExpiring,
    hasAutoArchive,
    scheduledAtLocal,
    expiresAtLocal,

    // 方法
    loadSchedule,
    saveSchedule,
    clearSchedule,

    // 快捷方法
    setScheduledAt,
    setExpiresAt,
    setAutoArchive,
    toggleScheduledAt,

    // 格式化
    formatDate,
    formatRelativeTime,

    // 状态管理
    reset,
  };
}
