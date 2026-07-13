/**
 * features/forms/public-api.ts
 *
 * 表单域统一导出入口
 *
 * 职责：
 * - 统一导出 forms feature 的所有公共接口
 * - 禁止外部直接 import features/forms 内部文件
 */

// ============= Services =============

export { formsService } from "./services/forms.service";

// ============= Hooks =============

export { formatFormListDate, formStatusLabel, useFormList } from "./hooks/useFormList";
export { useFormEditor } from "./hooks/useFormEditor";

// ============= 子域重新导出（向后兼容）============

export { useFormSubmissions, formatFormDate, formatFieldValue } from "../submissions/hooks/useFormSubmissions";
export type { FormSubmissionsTab, FormExportFormat } from "../submissions/hooks/useFormSubmissions";

// ============= Types =============

export type { FormSortMode, FormViewFilter } from "./hooks/useFormList";
export type { FieldCategories, FieldCategory, FormEditorStats, FormEditorTab, FormStatus } from "./form-editor.types";
export type {
  FieldType,
  FormConfig,
  FormField,
  FormItem,
  IpStats,
  SubmissionItem
} from "./types";
