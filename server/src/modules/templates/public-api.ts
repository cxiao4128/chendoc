/**
 * @fileoverview Templates 模块公共接口
 * @description 提供模板的 CRUD 操作，支持用户模板和内置模板，作为跨模块通信的唯一入口
 *
 * 功能说明：
 * - 用户模板管理（创建、更新、删除）
 * - 内置模板获取
 * - 模板分类和排序
 *
 * @module templates
 */

// 类型导出
export type {
  Template,
  CreateTemplateInput,
  UpdateTemplateInput,
} from "./types.js";

// 模板操作导出
export {
  listTemplates,
  listBuiltInTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateCount,
} from "./templates.service.js";
