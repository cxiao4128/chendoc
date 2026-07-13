/**
 * features/editor/index.ts - 编辑器模块导出
 *
 * 重构说明：
 * - 统一导出 editor 模块的 hooks、services 和类型
 */
export { useEditorMobile } from "./hooks/useEditorMobile";
export type { MobileSheetType } from "./hooks/useEditorMobile";
export { editorService } from "./services/editor.service";
export * from "./hooks/useEditorVersions";
export * from "./hooks/useEditorDocument";
export * from "./hooks/useEditorShare";
export * from "./hooks/useEditorSchedule";
export type {
  DocDetail,
  DocVersionPreview,
  TocItem
} from "./types";
