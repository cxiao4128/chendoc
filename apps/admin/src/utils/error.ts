/**
 * 通用工具函数
 */

/**
 * 统一错误信息提取
 */
export function normalizeError(error: unknown, fallback = "操作失败，请稍后重试。"): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "value" in error) return normalizeError((error as { value: unknown }).value, fallback);
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return String((error as { message: string }).message);
  }
  return fallback;
}