import type { ShareItem } from "../api/shares";

export interface UseDocShareOptions {
  /** 自动加载，默认 true */
  autoLoad?: boolean;
  /** 防抖延迟（毫秒），默认 700 */
  debounceDelay?: number;
  /** 加载成功回调 */
  onLoaded?: (share: ShareItem | null) => void;
  /** 保存成功回调 */
  onSaved?: (share: ShareItem) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

export type NormalizedDocShareOptions = Required<Pick<UseDocShareOptions, "autoLoad" | "debounceDelay">>
  & Pick<UseDocShareOptions, "onLoaded" | "onSaved" | "onError">;
