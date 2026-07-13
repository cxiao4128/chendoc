/**
 * features/editor/types.ts - 编辑器模块类型定义
 *
 * 重构说明：
 * - 从 api/docs 重新导出文档类型
 * - 定义编辑器模块本地类型
 */

import type {
  DocDetail,
  DocVersionPreview
} from "@/api/docs.types";

export type {
  DocDetail,
  DocVersionPreview
} from "@/api/docs";

// 编辑器模块本地类型
/** 目录项 */
export interface TocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

export interface VersionPreviewResult {
  version: DocVersionPreview;
}

export interface RestoreResult {
  doc: DocDetail;
}
