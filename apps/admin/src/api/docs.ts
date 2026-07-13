/**
 * api/docs.ts
 *
 * 兼容导出层 - 临时保留，逐步迁移到 services/api/
 *
 * ⚠️ 警告：不要再在此文件中添加新逻辑
 * ⚠️ 警告：不要再让新代码 import 本文件
 *
 * 迁移指引：
 * - 组件/页面 → import { ... } from "@/services/api"
 * - features hooks → import { ... } from "@/services/api"
 */

export * from "./docs.types";
export * from "./docs.core";
export * from "./docs.search";
export * from "./docs.trash";
export * from "./docs.versions";
export * from "./docs.export";

// 兼容重导出（从 services/api）
export {
  documentApi,
  listDocsApi,
  createDocApi,
  getDocApi,
  updateDocApi,
  deleteDocApi,
  bulkDeleteDocsApi,
  publishDocApi,
  searchDocsApi,
  searchDocsQuickApi
} from "@/services/api/document.api";
