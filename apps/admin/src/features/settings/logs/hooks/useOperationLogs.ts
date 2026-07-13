/**
 * features/settings/logs/hooks/useOperationLogs.ts
 * 操作日志 hooks（从上级迁移）
 */
import { computed, ref } from "vue";
import type { OperationLogView } from "../../../../services/api/settings.api";
import { settingsApi } from "../../../../services/api/settings.api";

const actionTextMap: Record<string, string> = {
  "auth.login.success": "登录成功",
  "auth.login.failure": "登录失败",
  "auth.logout": "退出登录",
  "auth.register.success": "注册账号",
  "auth.register.failure": "注册失败",
  "auth.password.change": "修改密码",
  "danger.doc.delete": "删除文档",
  "doc.create": "新建文档",
  "doc.soft_delete": "移入回收站",
  "doc.bulk_soft_delete": "批量删除文档",
  "doc.bulk_restore": "批量恢复文档",
  "doc.restore": "恢复文档",
  "doc.hard_delete": "永久删除文档",
  "doc.bulk_hard_delete": "批量永久删除文档",
  "doc.publish": "发布文档",
  "doc.version.restore": "恢复历史版本",
  "invite.create": "创建注册卡密",
  "invite.batch_create": "批量创建注册卡密",
  "invite.disable": "禁用注册卡密",
  "invite.delete": "删除注册卡密",
  "settings.site.update": "更新站点外观",
  "settings.bulk_update": "批量更新设置",
  "settings.r2.update": "更新 R2 设置",
  "settings.r2.test": "测试 R2 连接",
  "settings.r2.test_upload": "测试 R2 上传",
  "system.cleanupExpiredSessions": "清理过期会话",
  "system.cleanupExpiredCaptchas": "清理验证码",
  "system.emptyTrash": "清理回收站",
  "system.export_config": "导出系统配置",
  "system.healthCheck": "系统健康检测",
  "system.refreshStatus": "刷新运行状态",
  "share.create": "创建分享",
  "share.delete": "删除分享",
  "share.password.failure": "分享密码失败",
  "share.password.locked": "分享密码锁定",
  "share.enumeration": "分享枚举告警",
  "share.review.approve": "通过分享审核",
  "share.review.reject": "拒绝分享审核",
  "user.promote_admin": "提级为管理员",
  "user.disable_login": "禁止用户登录",
  "user.enable_login": "恢复用户登录",
  "user.password.view": "查看密码状态",
  "user.password.reset": "重置用户密码",
  "user.delete": "注销用户"
};

const targetTextMap: Record<string, string> = {
  auth: "认证",
  doc: "文档",
  invite: "注册卡密",
  settings: "设置",
  share: "分享",
  system: "系统",
  user: "用户"
};

const targetIdTextMap: Record<string, string> = {
  login: "登录",
  register: "注册",
  r2: "R2 配置",
  site: "站点外观"
};

export function formatLogDate(value: string) {
  return new Date(value).toLocaleString();
}

export function useOperationLogs() {
  const operationLogs = ref<OperationLogView[]>([]);
  const logsLoading = ref(false);
  const logsLoaded = ref(false);
  const recentOperationLogs = computed(() => operationLogs.value.slice(0, 6));

  async function loadOperationLogs(force = false) {
    if (logsLoading.value || (logsLoaded.value && !force)) return;
    logsLoading.value = true;
    try {
      operationLogs.value = (await settingsApi.logs()).logs;
      logsLoaded.value = true;
    } finally {
      logsLoading.value = false;
    }
  }

  function logActionText(action: string) {
    return actionTextMap[action] || "系统操作";
  }

  function logTargetText(log: OperationLogView) {
    const targetType = targetTextMap[log.targetType] || "对象";
    const mappedTargetId = targetIdTextMap[log.targetId];
    if (mappedTargetId) return mappedTargetId;
    if (log.targetId.startsWith("count:")) return `${targetType}数量 ${log.targetId.slice("count:".length)}`;
    return `${targetType} #${log.targetId}`;
  }

  function logActorText(log: OperationLogView) {
    return log.username || (log.userId ? `用户 #${log.userId}` : "系统");
  }

  return {
    operationLogs,
    logsLoading,
    logsLoaded,
    recentOperationLogs,
    loadOperationLogs,
    logActionText,
    logTargetText,
    logActorText,
    formatLogDate
  };
}
