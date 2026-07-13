import { publicUrl } from "../config/runtime";

type ShareLike = {
  customSlug?: string | null;
  shareCode?: number | string | null;
};

export function shareKeyOf(value: ShareLike | null | undefined) {
  if (!value) return "";
  if (value.customSlug) return value.customSlug;
  // 修复：shareCode 为 0 时也应该生成有效 URL
  if (value.shareCode !== undefined && value.shareCode !== null) return String(value.shareCode);
  return "";
}

export function sharePathOf(value: ShareLike | null | undefined) {
  const key = shareKeyOf(value);
  return key ? `/r/${key}` : "";
}

export function absoluteShareUrlOf(value: ShareLike | null | undefined) {
  const path = sharePathOf(value);
  return path ? publicUrl(path) : "";
}
