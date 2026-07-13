/**
 * @fileoverview Tags 模块公共接口
 * @description 提供标签的 CRUD 操作、层级管理、批量操作和合并功能，作为跨模块通信的唯一入口
 *
 * 功能说明：
 * - 标签 CRUD 操作
 * - 标签树形结构获取
 * - 批量标签操作（添加到文档、从文档移除）
 * - 标签合并与重命名
 * - 标签使用统计
 *
 * @module tags
 */

// 常量导出
export { TAG_COLORS, isValidColor } from "./tags.service.js";

// 类型导出
export type {
  Tag,
  TagWithChildren,
  CreateTagInput,
  UpdateTagInput,
} from "./tags.service.js";

// 标签操作导出
export {
  listTags,
  getTagTree,
  getTag,
  createTag,
  updateTag,
  deleteTag,
  addTagsToDocs,
  removeTagsFromDocs,
  mergeTags,
  renameTag,
  getTagStats,
} from "./tags.service.js";
