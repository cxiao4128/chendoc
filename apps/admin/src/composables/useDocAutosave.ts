/**
 * useDocAutosave.ts - 文档自动保存 Composable
 *
 * 增强说明：
 * - 增加网络状态感知（断网时暂停，恢复后自动保存）
 * - 增加保存状态监控
 * - 增加节流控制
 */
import { watch, onUnmounted } from "vue";
import { useNetworkStatus } from "./useNetworkStatus";

export interface UseDocAutosaveOptions {
  /** 防抖延迟（毫秒），默认 1200 */
  delayMs?: number;
  /** 是否正在保存的检查函数 */
  isSaving: () => boolean;
  /** 队列回调（当保存时又有新保存请求时触发） */
  onQueued?: () => void;
  /** 保存函数 */
  save: () => Promise<unknown>;
  /** 是否启用网络状态感知，默认 true */
  networkAware?: boolean;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
}

export interface UseDocAutosaveReturn {
  /** 清除定时器 */
  clear: () => void;
  /** 调度保存 */
  schedule: () => void;
  /** 立即保存（不清除定时器） */
  trigger: () => void;
}

export function useDocAutosave(options: UseDocAutosaveOptions): UseDocAutosaveReturn {
  const {
    delayMs = 1200,
    isSaving,
    onQueued,
    save,
    networkAware = true,
  } = options;

  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let unwatchNetwork: (() => void) | null = null;

  const { isOnline } = useNetworkStatus();

  function clear() {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = null;
  }

  function doSave() {
    if (isSaving()) {
      onQueued?.();
      return;
    }
    void save();
  }

  function schedule() {
    // 网络离线时不调度，等待网络恢复
    if (networkAware && !isOnline.value) {
      // 监听网络恢复
      if (!unwatchNetwork) {
        unwatchNetwork = watch(
          isOnline,
          (online: boolean) => {
            if (online) {
              unwatchNetwork?.();
              unwatchNetwork = null;
              // 网络恢复后立即保存
              clear();
              doSave();
            }
          },
          { immediate: true }
        );
      }
      return;
    }

    clear();
    timer = window.setTimeout(() => {
      timer = null;
      doSave();
    }, delayMs) as unknown as ReturnType<typeof globalThis.setTimeout>;
  }

  function trigger() {
    // 立即保存，清除定时器
    clear();
    doSave();
  }

  // 清理
  onUnmounted(() => {
    clear();
    unwatchNetwork?.();
  });

  return { clear, schedule, trigger };
}

/**
 * 简单的防抖 Hook
 */
export function useDebounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  function debounced(...args: Parameters<T>) {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return Object.assign(debounced, { cancel });
}

/**
 * 节流 Hook
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limitMs: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let lastRun = 0;
  let timer: number | undefined;

  function throttled(...args: Parameters<T>) {
    const now = Date.now();
    const remaining = limitMs - (now - lastRun);

    if (remaining <= 0) {
      if (timer) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      lastRun = now;
      fn(...args);
    } else if (!timer) {
      timer = window.setTimeout(() => {
        timer = undefined;
        lastRun = Date.now();
        fn(...args);
      }, remaining);
    }
  }

  function cancel() {
    if (timer) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    lastRun = 0;
  }

  return Object.assign(throttled, { cancel });
}
