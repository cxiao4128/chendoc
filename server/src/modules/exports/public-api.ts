/**
 * @fileoverview Exports 模块公共接口
 * @description 提供文档批量导出的服务端功能，作为跨模块通信的唯一入口
 *
 * 功能说明：
 * - 获取文档用于导出（解密并格式化）
 * - 导出格式转换（Markdown、HTML、JSON）
 * - 导出文件名安全化处理
 *
 * 依赖说明：
 * - 依赖 docs 模块的 DocumentActor 访问控制
 * - 依赖文档加密模块进行内容解密
 *
 * @module exports
 */

export type {
  ExportDocument,
  ExportResult,
} from "./exports.service.js";

export {
  getDocumentsForExport,
  getDocumentByUid,
  exportAsMarkdown,
  exportAsHtml,
  exportAsJson,
  getSafeFileName,
} from "./exports.service.js";
