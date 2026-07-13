/**
 * features/documents/hooks/useDocPreview.ts
 *
 * 职责：文档预览文本处理、高亮
 */
import { computed } from "vue";
import { useRoute } from "vue-router";

/** 文档预览来源类型 */
interface DocPreviewSource {
  summary?: string | null;
  excerpt?: string | null;
  snippet?: string | null;
  contentText?: string | null;
  contentHtml?: string | null;
}

/** 预览文本部分（用于高亮） */
export interface PreviewPart {
  text: string;
  highlighted: boolean;
}

export function useDocPreview() {
  const route = useRoute();

  /** 当前搜索关键词 */
  const query = computed(() => String(route.query.q || "").trim());
  // ============= 工具函数 =============

  /**
   * 清理 HTML，转为纯文本
   */
  function normalizePreview(value: string): string {
    return value
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 限制预览文本长度（132字符），围绕关键词截取
   */
  function clampPreview(text: string, keyword: string): string {
    const limit = 132;
    if (text.length <= limit) return text;
    if (!keyword) return `${text.slice(0, limit)}…`;
    const index = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (index < 0) return `${text.slice(0, limit)}…`;
    const start = Math.max(0, index - 36);
    const end = Math.min(text.length, index + keyword.length + 84);
    return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  }

  // ============= 核心方法 =============

  /**
   * 获取文档预览文本
   */
  function getPreviewText(doc: DocPreviewSource): string {
    const source = doc.summary || doc.excerpt || doc.snippet || doc.contentText || doc.contentHtml || "";
    const text = normalizePreview(source);
    if (!text) return "";
    return clampPreview(text, query.value);
  }

  /**
   * 获取文档预览文本（带高亮）
   */
  function getPreviewParts(doc: DocPreviewSource): PreviewPart[] {
    const source = doc.summary || doc.excerpt || doc.snippet || doc.contentText || doc.contentHtml || "";
    const text = normalizePreview(source);
    if (!text) return [];

    const q = query.value;
    const clamped = clampPreview(text, q);
    if (!q) return [{ text: clamped, highlighted: false }];

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const kw = q.toLowerCase();

    return clamped.split(regex).filter(Boolean).map((part) => ({
      text: part,
      highlighted: part.toLowerCase() === kw
    }));
  }

  return {
    normalizePreview,
    clampPreview,
    getPreviewText,
    getPreviewParts,
  };
}
