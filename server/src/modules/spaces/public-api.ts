/**
 * @fileoverview Spaces 模块公共 API 导出
 *
 * 模块职责：空间（分类）的 CRUD 操作
 *
 * 功能说明：
 * - 空间列表查询
 * - 空间创建
 * - 空间更新
 * - 空间删除
 *
 * @module spaces
 */

export {
  listSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
} from "./spaces.service.js";
