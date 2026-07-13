/**
 * features/editor/public-api.ts
 *
 * 编辑器域统一导出入口
 *
 * 职责：
 * - 统一导出 editor feature 的所有公共接口
 * - 禁止外部直接 import features/editor 内部文件
 */

export { useEditorDocument } from "./hooks/useEditorDocument";
export { useEditorVersions } from "./hooks/useEditorVersions";
export { useEditorSchedule } from "./hooks/useEditorSchedule";
export { useEditorShare } from "./hooks/useEditorShare";
export { useEditorMobile } from "./hooks/useEditorMobile";
export { useDocEditorPage } from "./hooks/useDocEditorPage";

export { editorService } from "./services/editor.service";

export type { MobileSheetType } from "./hooks/useEditorMobile";

export type {
  DocDetail,
  DocVersionPreview,
  TocItem,
  VersionPreviewResult,
  RestoreResult
} from "./types";
