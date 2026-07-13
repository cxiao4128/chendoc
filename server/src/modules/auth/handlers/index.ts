/**
 * @fileoverview Auth 模块 - 处理器层
 *
 * 职责：处理请求参数解析、业务编排、响应格式化
 * 禁止：直接写 SQL、写权限判断（放 policies/）
 */

export { loginHandler } from "./login.handler.js";
export { registerHandler } from "./register.handler.js";
export { meHandler } from "./me.handler.js";
export { refreshHandler } from "./refresh.handler.js";
export { logoutHandler } from "./logout.handler.js";
export { changePasswordHandler } from "./change-password.handler.js";
