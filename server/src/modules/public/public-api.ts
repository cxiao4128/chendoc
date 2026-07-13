/**
 * @fileoverview Public 模块公共接口
 * @description 提供公开分享页面渲染和访问功能，作为跨模块通信的唯一入口
 *
 * 功能说明：
 * - 分享页面渲染（包含缓存优化）
 * - 公开分享访问（无需认证）
 * - 分享密码验证
 * - 缓存失效控制
 *
 * 依赖说明：
 * - 依赖 settings 模块的站点配置
 * - 依赖 shares 模块的分享访问控制
 *
 * @module public
 */

// ===== 分享页渲染服务 =====
export {
  renderSharePage,
  invalidateSiteBrandCache,
} from "./public.service.js";
export { checkShareHtmlCache, invalidateShareHtmlCache } from "./share-html-cache.js";

// ===== 分享页 HTML 模板 =====
export {
  renderShareHtml,
  renderSharePasswordHtml,
  renderShareUnavailableHtml,
} from "./renderShareHtml.js";
