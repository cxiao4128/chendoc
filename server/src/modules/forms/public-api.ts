/**
 * @fileoverview Forms 模块公共接口
 * @description 提供表单创建、管理、提交和公开访问的完整功能，作为跨模块通信的唯一入口
 *
 * 功能划分：
 * - 表单 CRUD（需要认证）
 * - 表单提交处理（可公开访问）
 * - 公开表单页面渲染
 * - 表单提交策略
 *
 * @module forms
 */

export type {
  FieldType,
  FormField,
  FormConfig,
  FormRecord,
  SubmissionRecord,
  IpStats,
} from "./forms.service.js";

export {
  createForm,
  listForms,
  getForm,
  getFormByUid,
  updateForm,
  deleteForm,
  deleteSubmission,
  deleteAllFormSubmissions,
  publishForm,
  closeForm,
  submitForm,
  listFormSubmissions,
  exportFormSubmissions,
  getFormIpStats,
  validateFormSubmission,
  incrementFormView,
  runFormMaintenance,
  recalibrateFormSubmissionCounts,
} from "./forms.service.js";

export { FormSubmissionPolicy } from "./FormSubmissionPolicy.js";

export { renderFormPage, renderFormUnavailablePage } from "./forms.public.js";
