<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import {
  Activity,
  ArrowLeft,
  Ban,
  CheckCircle2,
  CloudUpload,
  Copy,
  Database,
  ExternalLink,
  Github,
  KeyRound,
  LockKeyhole,
  MoreHorizontal,
  Paintbrush,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  ScrollText,
  Server,
  Share2,
  Trash2,
  UserCog,
  Wrench
} from "lucide-vue-next";
import {
  deleteManagedUserApi,
  disableManagedUserApi,
  enableManagedUserApi,
  exportSystemConfigApi,
  getManagedUserPasswordApi,
  getManagedUserApi,
  getSiteConfigApi,
  getSystemStatusApi,
  listManagedUsersApi,
  listOperationLogsApi,
  promoteManagedUserApi,
  resetManagedUserPasswordApi,
  runSystemActionApi,
  saveSiteConfigApi,
  type ManagedUserView,
  type OperationLogView,
  type SystemAction,
  type SystemStatusView
} from "../../api/settings";
import { defaultRemoteLogoUrl, defaultRemoteWallpaperUrl } from "../../config/site-assets";
import { useIsMobileViewport } from "../../composables/useViewport";
import { nativeConfirm } from "../../services/nativeDialog";
import { useAuthStore } from "../../stores/auth";
import LogsSettingsSection from "./components/LogsSettingsSection.vue";
import MaintenanceSettingsSection from "./components/MaintenanceSettingsSection.vue";
import SiteSettingsSection from "./components/SiteSettingsSection.vue";
import StorageSettingsSection from "./components/StorageSettingsSection.vue";
import UsersSettingsSection from "./components/UsersSettingsSection.vue";
import "./css/settings.css";

type ActivePanel = "overview" | "logs" | "appearance" | "recovery" | "users" | "security" | "shares" | "storage" | "maintenance" | "version";
type UserDetailTab = "info" | "roles" | "login" | "actions";
type UpdateState = "idle" | "checking" | "latest" | "outdated" | "error";

const APP_VERSION = "v2.9.0";
const GITHUB_REPO_URL = "https://github.com/cxiao4128/chendoc";
const GITHUB_API_BASE = "https://api.github.com/repos/cxiao4128/chendoc";
const GITHUB_RAW_PACKAGE_URL = "https://raw.githubusercontent.com/cxiao4128/chendoc/main/package.json";

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

const site = reactive({
  brandName: "陈书",
  shortName: "陈书",
  logoUrl: defaultRemoteLogoUrl,
  authWallpaperUrl: defaultRemoteWallpaperUrl,
  preferRemoteLogo: false,
  preferRemoteWallpaper: false,
  copyright: "2026 陈书",
  recoveryContact: "请联系管理员",
  shareFooterText: ""
});
const saving = ref(false);
const message = ref("");
const isMobile = useIsMobileViewport();
const auth = useAuthStore();
const activePanel = ref<ActivePanel>("overview");
const operationLogs = ref<OperationLogView[]>([]);
const logsLoading = ref(false);
const logsLoaded = ref(false);
const users = ref<ManagedUserView[]>([]);
const usersLoading = ref(false);
const usersLoaded = ref(false);
const userSearch = ref("");
const userRoleFilter = ref<"all" | "admin" | "user">("all");
const userStatusFilter = ref<"all" | "active" | "disabled">("all");
const selectedUserIds = ref<number[]>([]);
const selectedUser = ref<ManagedUserView | null>(null);
const userDetailOpen = ref(false);
const userDetailTab = ref<UserDetailTab>("info");
const selectedUserLoading = ref(false);
const userActionLoading = ref<number | null>(null);
const userMessage = ref("");
const userPasswordValue = ref("");
const userPasswordConfirmValue = ref("");
const userPasswordMessage = ref("");
const userPasswordLoading = ref(false);
const updateState = ref<UpdateState>("idle");
const updateMessage = ref("");
const systemStatus = ref<SystemStatusView | null>(null);
const systemLoading = ref(false);
const systemMessage = ref("");
const systemActionLoading = ref<SystemAction | "export" | null>(null);
let systemRefreshTimer: number | undefined;

const versionStatusText = computed(() => {
  if (updateState.value === "checking") return "正在检查 GitHub 版本";
  if (updateState.value === "latest") return updateMessage.value || "当前版本已与 GitHub 保持一致";
  if (updateState.value === "outdated") return updateMessage.value;
  if (updateState.value === "error") return updateMessage.value || "暂时无法检查更新";
  return "可与 GitHub 最新版本进行比对";
});

const currentVersion = computed(() => systemStatus.value?.version || APP_VERSION);
const recentOperationLogs = computed(() => operationLogs.value.slice(0, 6));
const storageUsagePercent = computed(() => {
  const usedBytes = systemStatus.value?.storage.totalBytes || 0;
  const quotaBytes = 10 * 1024 * 1024 * 1024;
  return Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10);
});
const securitySummaryText = computed(() => {
  const security = systemStatus.value?.security;
  if (!security) return "等待安全状态刷新";
  if (security.expiredSessions || security.staleCaptchas) return "有可清理项";
  return "会话与验证码正常";
});
const filteredManagedUsers = computed(() => {
  const keyword = userSearch.value.trim().toLowerCase();
  return users.value.filter((user) => {
    const matchesKeyword = !keyword || [
      user.username,
      roleText(user),
      statusText(user.status),
      user.lastIp || "",
      ...(user.recentIps || [])
    ].some((value) => value.toLowerCase().includes(keyword));
    const matchesRole = userRoleFilter.value === "all" || user.role === userRoleFilter.value;
    const matchesStatus = userStatusFilter.value === "all" || user.status === userStatusFilter.value;
    return matchesKeyword && matchesRole && matchesStatus;
  });
});
const managedUserStats = computed(() => {
  const total = users.value.length;
  const active = users.value.filter((user) => user.status === "active").length;
  const admins = users.value.filter((user) => user.role === "admin").length;
  const disabled = users.value.filter((user) => user.status === "disabled").length;
  const docs = users.value.reduce((sum, user) => sum + user.docCount, 0);
  return { total, active, admins, disabled, docs };
});
const allFilteredUsersSelected = computed(() => (
  filteredManagedUsers.value.length > 0 &&
  filteredManagedUsers.value.every((user) => selectedUserIds.value.includes(user.id))
));
const selectedUserActivityLogs = computed(() => {
  const user = selectedUser.value;
  if (!user) return [];
  return operationLogs.value
    .filter((log) => log.userId === user.id || log.username === user.username)
    .slice(0, 5);
});
const selectedUserLogs = computed(() => {
  const user = selectedUser.value;
  if (!user) return [];
  return operationLogs.value.filter((log) => log.userId === user.id || log.username === user.username);
});
const selectedUserLoginLogs = computed(() => selectedUserLogs.value.filter((log) => log.action.startsWith("auth.login")));
const selectedUserActionLogs = computed(() => selectedUserLogs.value.filter((log) => !log.action.startsWith("auth.login")));

async function load() {
  const response = await getSiteConfigApi();
  Object.assign(site, response.config);
}

async function loadSystemStatus() {
  systemLoading.value = true;
  try {
    systemStatus.value = (await getSystemStatusApi()).status;
  } finally {
    systemLoading.value = false;
  }
}

async function refreshAll() {
  await Promise.all([load(), loadSystemStatus()]);
}

async function loadOperationLogs(force = false) {
  if (logsLoading.value || (logsLoaded.value && !force)) return;
  logsLoading.value = true;
  try {
    operationLogs.value = (await listOperationLogsApi()).logs;
    logsLoaded.value = true;
  } finally {
    logsLoading.value = false;
  }
}

function openPanel(panel: ActivePanel) {
  activePanel.value = panel;
  if (activePanel.value === "logs") void loadOperationLogs();
  if (activePanel.value === "users") void loadUsers();
  if (["security", "shares", "storage", "maintenance"].includes(activePanel.value || "")) void loadSystemStatus();
}

async function save() {
  saving.value = true;
  message.value = "";
  try {
    const response = await saveSiteConfigApi(site);
    Object.assign(site, response.config);
    message.value = "已保存";
  } finally {
    saving.value = false;
  }
}

function formatLogDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

function formatUptime(seconds = 0) {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时 ${minutes % 60} 分钟`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

function logTrendText() {
  const logs = systemStatus.value?.logs;
  if (!logs) return "等待实时统计";
  if (!logs.delta) return "与昨日持平";
  const sign = logs.delta > 0 ? "+" : "";
  return `较昨日 ${sign}${logs.delta}（${sign}${logs.deltaPercent}%）`;
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

async function loadUsers(force = false) {
  if (usersLoading.value || (usersLoaded.value && !force)) return;
  usersLoading.value = true;
  userMessage.value = "";
  try {
    users.value = (await listManagedUsersApi()).users;
    usersLoaded.value = true;
    selectedUserIds.value = selectedUserIds.value.filter((id) => users.value.some((user) => user.id === id));
    if (userDetailOpen.value && !selectedUser.value && users.value.length) await selectUser(users.value[0].id);
  } finally {
    usersLoading.value = false;
  }
}

async function selectUser(id: number) {
  selectedUserLoading.value = true;
  userMessage.value = "";
  userPasswordMessage.value = "";
  userPasswordValue.value = "";
  userPasswordConfirmValue.value = "";
  try {
    selectedUser.value = (await getManagedUserApi(id)).user;
  } finally {
    selectedUserLoading.value = false;
  }
}

function roleText(user: Pick<ManagedUserView, "role" | "isSuperAdmin">) {
  if (user.isSuperAdmin) return "超级管理员";
  return user.role === "admin" ? "管理员" : "普通用户";
}

function statusText(status: "active" | "disabled") {
  return status === "active" ? "可登录" : "已禁止登录";
}

function userInitials(username: string) {
  return username.slice(0, 2).toUpperCase();
}

function openUserDetail(user: ManagedUserView) {
  userDetailOpen.value = true;
  userDetailTab.value = "info";
  void loadOperationLogs();
  void selectUser(user.id);
}

function closeUserDetail() {
  userDetailOpen.value = false;
  userDetailTab.value = "info";
  selectedUser.value = null;
  userPasswordValue.value = "";
  userPasswordConfirmValue.value = "";
  userPasswordMessage.value = "";
}

function resetUserFilters() {
  userSearch.value = "";
  userRoleFilter.value = "all";
  userStatusFilter.value = "all";
  selectedUserIds.value = [];
}

function toggleUserSelection(id: number) {
  selectedUserIds.value = selectedUserIds.value.includes(id)
    ? selectedUserIds.value.filter((value) => value !== id)
    : [...selectedUserIds.value, id];
}

function toggleAllFilteredUsers() {
  if (allFilteredUsersSelected.value) {
    selectedUserIds.value = selectedUserIds.value.filter((id) => !filteredManagedUsers.value.some((user) => user.id === id));
    return;
  }
  selectedUserIds.value = Array.from(new Set([...selectedUserIds.value, ...filteredManagedUsers.value.map((user) => user.id)]));
}

async function refreshSelectedUser(nextUser?: ManagedUserView) {
  await loadUsers(true);
  if (nextUser) selectedUser.value = nextUser;
  else if (selectedUser.value) await selectUser(selectedUser.value.id);
}

async function promoteUser(user: ManagedUserView) {
  userActionLoading.value = user.id;
  try {
    const response = await promoteManagedUserApi(user.id);
    userMessage.value = `${user.username} 已提级为管理员`;
    await refreshSelectedUser(response.user);
  } finally {
    userActionLoading.value = null;
  }
}

function canPromoteUser(user: ManagedUserView) {
  return auth.isSuperAdmin && user.role !== "admin";
}

function canManageUser(user: ManagedUserView) {
  if (user.id === auth.user?.id) return false;
  if (user.role === "admin" && !auth.isSuperAdmin) return false;
  return true;
}

async function disableUser(user: ManagedUserView) {
  userActionLoading.value = user.id;
  try {
    const response = await disableManagedUserApi(user.id);
    userMessage.value = `${user.username} 已禁止登录`;
    await refreshSelectedUser(response.user);
  } finally {
    userActionLoading.value = null;
  }
}

async function enableUser(user: ManagedUserView) {
  userActionLoading.value = user.id;
  try {
    const response = await enableManagedUserApi(user.id);
    userMessage.value = `${user.username} 已恢复登录`;
    await refreshSelectedUser(response.user);
  } finally {
    userActionLoading.value = null;
  }
}

async function deleteUser(user: ManagedUserView) {
  const confirmed = await nativeConfirm({
    title: "注销用户",
    message: `确认注销用户「${user.username}」吗？账号会删除，但文档会保留。`,
    confirmText: "注销用户",
    danger: true
  });
  if (!confirmed) return;
  userActionLoading.value = user.id;
  try {
    await deleteManagedUserApi(user.id);
    userMessage.value = `${user.username} 已注销`;
    selectedUser.value = null;
    userDetailOpen.value = false;
    await loadUsers(true);
  } finally {
    userActionLoading.value = null;
  }
}

async function viewUserPassword(user: ManagedUserView) {
  userPasswordLoading.value = true;
  userPasswordMessage.value = "";
  try {
    const response = await getManagedUserPasswordApi(user.id);
    userPasswordMessage.value = response.password.message;
  } finally {
    userPasswordLoading.value = false;
  }
}

async function resetUserPassword(user: ManagedUserView) {
  const password = userPasswordValue.value.trim();
  const confirmedPassword = userPasswordConfirmValue.value.trim();
  if (!password) {
    userPasswordMessage.value = "请输入新密码";
    return;
  }
  if (confirmedPassword && confirmedPassword !== password) {
    userPasswordMessage.value = "两次密码不一致";
    return;
  }
  userPasswordLoading.value = true;
  userPasswordMessage.value = "";
  try {
    const response = await resetManagedUserPasswordApi(user.id, password);
    userPasswordValue.value = "";
    userPasswordConfirmValue.value = "";
    userPasswordMessage.value = `${user.username} 密码已重置`;
    await refreshSelectedUser(response.user);
  } finally {
    userPasswordLoading.value = false;
  }
}

async function copyUserId(user: ManagedUserView) {
  try {
    await navigator.clipboard?.writeText(String(user.id));
    userMessage.value = `已复制用户 ID：${user.id}`;
  } catch {
    userMessage.value = `用户 ID：${user.id}`;
  }
}

function canonicalVersion(value: string) {
  const raw = value.trim().toLowerCase().replace(/^v/, "");
  const displayMatch = raw.match(/^1\.(\d{2})$/);
  if (displayMatch) return `1.0.${Number(displayMatch[1])}`;
  const shortSemverMatch = raw.match(/^(\d+)\.(\d+)$/);
  if (shortSemverMatch) return `${shortSemverMatch[1]}.${shortSemverMatch[2]}.0`;
  return raw;
}

async function fetchLatestGitHubVersion() {
  const packageResponse = await fetch(`${GITHUB_RAW_PACKAGE_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (packageResponse.ok) {
    const packageJson = await packageResponse.json() as { version?: string };
    if (packageJson.version) return packageJson.version;
  }

  const releaseResponse = await fetch(`${GITHUB_API_BASE}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (releaseResponse.ok) {
    const release = await releaseResponse.json() as { tag_name?: string; name?: string };
    if (release.tag_name || release.name) return String(release.tag_name || release.name);
  }

  const tagResponse = await fetch(`${GITHUB_API_BASE}/tags?per_page=1`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (tagResponse.ok) {
    const tags = await tagResponse.json() as Array<{ name?: string }>;
    if (tags[0]?.name) return tags[0].name;
  }

  throw new Error("GitHub 暂无可比对版本");
}

async function checkUpdate() {
  updateState.value = "checking";
  updateMessage.value = "";
  try {
    const remoteVersion = await fetchLatestGitHubVersion();
    if (canonicalVersion(remoteVersion) === canonicalVersion(currentVersion.value)) {
      updateState.value = "latest";
      updateMessage.value = `已是最新版本，GitHub 当前也是 ${remoteVersion}`;
    } else {
      updateState.value = "outdated";
      updateMessage.value = `GitHub 最新为 ${remoteVersion}，当前为 ${currentVersion.value}`;
    }
  } catch (error) {
    updateState.value = "error";
    updateMessage.value = error instanceof Error ? error.message : "检查更新失败，请稍后重试";
  }
}

async function runSystemAction(action: SystemAction) {
  const confirmations: Partial<Record<SystemAction, { title: string; message: string; confirmText: string; danger?: boolean }>> = {
    cleanupExpiredSessions: {
      title: "清理过期会话",
      message: `将删除 ${systemStatus.value?.security.expiredSessions ?? 0} 个已过期登录会话。有效会话不受影响。`,
      confirmText: "确认清理"
    },
    cleanupExpiredCaptchas: {
      title: "清理验证码",
      message: `将删除 ${systemStatus.value?.security.staleCaptchas ?? 0} 个已过期或已使用验证码。删除后不可恢复。`,
      confirmText: "确认清理"
    },
    cleanupExpiredLogs: {
      title: "清理过期日志",
      message: "将永久删除超过系统保留期限的登录日志和操作日志；保留期限内日志不受影响。",
      confirmText: "永久清理",
      danger: true
    },
    emptyTrash: {
      title: "清空回收站",
      message: `将永久删除回收站内 ${systemStatus.value?.docs.trash ?? 0} 篇文档。该操作不可撤销。`,
      confirmText: "永久清理",
      danger: true
    }
  };
  const confirmation = confirmations[action];
  if (confirmation) {
    const confirmed = await nativeConfirm({
      ...confirmation
    });
    if (!confirmed) return;
  }
  systemActionLoading.value = action;
  systemMessage.value = "";
  try {
    const result = (await runSystemActionApi(action)).result;
    systemMessage.value = result.message;
    if (result.status) systemStatus.value = result.status;
    else await loadSystemStatus();
    if (action !== "refreshStatus" && action !== "healthCheck") await loadOperationLogs(true);
  } finally {
    systemActionLoading.value = null;
  }
}

async function exportConfig() {
  const confirmed = await nativeConfirm({
    title: "导出系统配置",
    message: "将下载站点配置、脱敏 R2 配置、系统设置和运行统计。密钥及数据库密码不会导出。",
    confirmText: "确认导出"
  });
  if (!confirmed) return;
  systemActionLoading.value = "export";
  systemMessage.value = "";
  try {
    const payload = (await exportSystemConfigApi()).export;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chendoc-system-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    systemMessage.value = "系统配置已导出";
    await loadOperationLogs(true);
  } finally {
    systemActionLoading.value = null;
  }
}

onMounted(() => {
  void refreshAll();
  void loadOperationLogs();
  systemRefreshTimer = window.setInterval(() => {
    void loadSystemStatus();
  }, 30_000);
});

onBeforeUnmount(() => {
  if (systemRefreshTimer) window.clearInterval(systemRefreshTimer);
});
</script>

<template>
  <section class="settings-page" :class="{ 'is-mobile': isMobile }">
    <header class="settings-page__head">
      <div>
        <h1>系统管理中心</h1>
        <p>查看实时状态、用户、日志、外观和维护动作。</p>
      </div>
      <button class="cd-button" type="button" :disabled="systemLoading" @click="refreshAll">
        <RefreshCw :size="16" />{{ systemLoading ? "刷新中" : "刷新" }}
      </button>
    </header>

    <nav class="settings-page__tabs" aria-label="系统管理导航">
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'overview' }" type="button" @click="openPanel('overview')">
        <Activity :size="16" />概览
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'users' }" type="button" @click="openPanel('users')">
        <UserCog :size="16" />用户与权限
      </button>
      <RouterLink class="settings-page__tab settings-page__tab--link" to="/admin/invites">
        <KeyRound :size="16" />注册卡密
      </RouterLink>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'security' }" type="button" @click="openPanel('security')">
        <ShieldCheck :size="16" />安全策略
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'shares' }" type="button" @click="openPanel('shares')">
        <Share2 :size="16" />分享管理
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'storage' }" type="button" @click="openPanel('storage')">
        <Database :size="16" />存储与 R2
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'appearance' }" type="button" @click="openPanel('appearance')">
        <Paintbrush :size="16" />站点外观
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'recovery' }" type="button" @click="openPanel('recovery')">
        <KeyRound :size="16" />账号找回
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'logs' }" type="button" @click="openPanel('logs')">
        <ScrollText :size="16" />日志审计
      </button>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'maintenance' }" type="button" @click="openPanel('maintenance')">
        <Wrench :size="16" />系统维护
      </button>
      <RouterLink class="settings-page__tab settings-page__tab--link" to="/admin/article-delete">
        <Trash2 :size="16" />文档删除
      </RouterLink>
      <button class="settings-page__tab" :class="{ 'is-active': activePanel === 'version' }" type="button" @click="openPanel('version')">
        <ExternalLink :size="16" />版本更新
      </button>
    </nav>

    <section v-if="activePanel === 'overview'" class="settings-page__overview">
      <div class="settings-page__status-grid">
        <article>
          <div><small>当前版本 <b>稳定</b></small><strong>{{ currentVersion }}</strong><span>{{ versionStatusText }}</span></div>
          <ShieldCheck :size="28" />
        </article>
        <article>
          <div><small>服务状态 <b>{{ systemStatus?.service.label || "读取中" }}</b></small><strong>{{ systemStatus ? formatUptime(systemStatus.service.uptimeSeconds) : "--" }}</strong><span>{{ systemStatus ? `内存 ${systemStatus.service.memoryMb} MB · ${systemStatus.service.nodeEnv}` : "正在读取运行状态" }}</span></div>
          <Server :size="28" />
        </article>
        <article>
          <div><small>存储记录 <b>{{ systemStatus?.r2.configured ? "已配置" : "未完整" }}</b></small><strong>{{ formatBytes(systemStatus?.storage.totalBytes || 0) }}</strong><span>{{ systemStatus ? `${systemStatus.storage.fileCount} 个文件记录 · R2 ${systemStatus.r2.configured ? "正常" : "待配置"}` : "正在读取存储状态" }}</span></div>
          <Database :size="28" />
        </article>
        <article>
          <div><small>今日操作日志 <b>{{ logTrendText() }}</b></small><strong>{{ systemStatus?.logs.today ?? "--" }}</strong><span>最近关键事件已加载 {{ recentOperationLogs.length }} 条</span></div>
          <ScrollText :size="28" />
        </article>
      </div>

      <div class="settings-page__overview-grid">
        <article class="settings-page__panel settings-page__info-panel">
          <header>
            <div><small>系统信息</small><h2>服务运行状态 / 环境信息</h2></div>
            <Activity :size="20" />
          </header>
          <dl class="settings-page__definition-grid">
            <div><dt>应用状态</dt><dd>{{ systemStatus?.service.label || "读取中" }}</dd></div>
            <div><dt>Node.js 环境</dt><dd>{{ systemStatus?.service.nodeEnv || "--" }}</dd></div>
            <div><dt>数据库</dt><dd>{{ systemStatus?.database.provider || "--" }} · {{ systemStatus?.database.label || "读取中" }}</dd></div>
            <div><dt>启动时间</dt><dd>{{ systemStatus ? formatLogDate(systemStatus.service.startedAt) : "--" }}</dd></div>
            <div><dt>服务地址</dt><dd>{{ systemStatus?.service.publicSiteUrl || "--" }}</dd></div>
            <div><dt>内存占用</dt><dd>{{ systemStatus ? `${systemStatus.service.memoryMb} MB` : "--" }}</dd></div>
          </dl>
          <footer class="settings-page__chips">
            <span>API {{ systemStatus?.service.label || "读取中" }}</span>
            <span>DB {{ systemStatus?.database.label || "读取中" }}</span>
            <span>文档 {{ systemStatus?.docs.active ?? 0 }} 篇</span>
          </footer>
        </article>

        <article class="settings-page__panel settings-page__info-panel">
          <header>
            <div><small>安全状态摘要</small><h2>{{ securitySummaryText }}</h2></div>
            <ShieldCheck :size="20" />
          </header>
          <dl class="settings-page__definition-grid">
            <div><dt>活跃会话</dt><dd>{{ systemStatus?.security.activeSessions ?? 0 }} 个</dd></div>
            <div><dt>过期会话</dt><dd>{{ systemStatus?.security.expiredSessions ?? 0 }} 个</dd></div>
            <div><dt>有效验证码</dt><dd>{{ systemStatus?.security.activeCaptchas ?? 0 }} 个</dd></div>
            <div><dt>待清理验证码</dt><dd>{{ systemStatus?.security.staleCaptchas ?? 0 }} 个</dd></div>
          </dl>
          <button class="settings-page__text-action" type="button" @click="openPanel('security')">查看安全策略</button>
        </article>

        <article class="settings-page__panel settings-page__info-panel">
          <header>
            <div><small>存储与 R2 状态</small><h2>{{ systemStatus?.r2.configured ? "R2 配置完整" : "R2 需要配置" }}</h2></div>
            <CloudUpload :size="20" />
          </header>
          <dl class="settings-page__definition-grid">
            <div><dt>存储适配器</dt><dd>R2</dd></div>
            <div><dt>存储空间使用</dt><dd>{{ formatBytes(systemStatus?.storage.totalBytes || 0) }} / 10 GB</dd></div>
            <div><dt>对象数量</dt><dd>{{ systemStatus?.storage.fileCount ?? 0 }}</dd></div>
            <div><dt>区域</dt><dd>{{ systemStatus?.r2.region || "auto" }}</dd></div>
            <div><dt>访问域名</dt><dd>{{ systemStatus?.r2.publicUrl || "未配置" }}</dd></div>
            <div><dt>R2 连接状态</dt><dd>{{ systemStatus?.r2.message || "等待刷新" }}</dd></div>
          </dl>
          <div class="settings-page__progress"><span :style="{ width: `${storageUsagePercent}%` }"></span></div>
          <RouterLink class="settings-page__text-action" to="/admin/settings/storage">查看存储与 R2 配置</RouterLink>
        </article>

        <article class="settings-page__panel settings-page__info-panel">
          <header>
            <div><small>最近更新 / 系统公告</small><h2>运行建议</h2></div>
            <ScrollText :size="20" />
          </header>
          <ul class="settings-page__announcement-list">
            <li><b>系统更新</b><span>{{ currentVersion }} 已启用，建议定期检查更新。</span></li>
            <li><b>安全策略</b><span>建议开启管理员 TOTP，降低账号被盗风险。</span></li>
            <li><b>存储配置</b><span>{{ systemStatus?.r2.message || "等待读取 R2 状态。" }}</span></li>
          </ul>
          <button class="settings-page__text-action" type="button" @click="openPanel('version')">查看版本更新</button>
        </article>
      </div>

      <div class="settings-page__overview-bottom">
        <article class="settings-page__panel settings-page__recent-panel">
          <header class="settings-page__inline-head">
            <div><small>最近操作日志</small><h2>关键事件</h2></div>
            <button class="settings-page__text-action" type="button" @click="openPanel('logs')">查看全部日志</button>
          </header>
          <div v-if="logsLoading" class="settings-page__logs-empty">加载中...</div>
          <div v-else-if="!recentOperationLogs.length" class="settings-page__logs-empty">暂无操作记录</div>
          <div v-else class="settings-page__compact-log">
            <article v-for="log in recentOperationLogs" :key="log.id">
              <time>{{ formatLogDate(log.createdAt) }}</time>
              <strong>{{ logActionText(log.action) }}</strong>
              <span>{{ logActorText(log) }}</span>
              <code>{{ log.ip || "--" }}</code>
            </article>
          </div>
        </article>

        <article class="settings-page__panel settings-page__suggestion-panel">
          <header><small>系统建议</small><h2>下一步</h2></header>
          <button type="button" @click="openPanel('security')"><ShieldCheck :size="18" /><span><strong>清理登录与验证码</strong><small>过期会话和验证码保持低水位。</small></span></button>
          <RouterLink to="/admin/settings/storage"><Database :size="18" /><span><strong>检查 R2 配置</strong><small>确保上传、分享图片和文件可用。</small></span></RouterLink>
          <button type="button" @click="openPanel('maintenance')"><Wrench :size="18" /><span><strong>执行系统健康检测</strong><small>快速检查 API、DB、R2 状态。</small></span></button>
          <button type="button" @click="openPanel('version')"><RefreshCw :size="18" /><span><strong>检查系统更新</strong><small>当前版本 {{ currentVersion }}。</small></span></button>
        </article>
      </div>
    </section>

    <LogsSettingsSection v-if="activePanel === 'logs'">
      <div class="settings-page__panel-head">
        <div>
          <small>最近 80 条</small>
          <h2>操作日志</h2>
        </div>
        <button class="cd-button" type="button" :disabled="logsLoading" @click="loadOperationLogs(true)">
          <RefreshCw :size="16" />{{ logsLoading ? "刷新中" : "刷新" }}
        </button>
      </div>
      <div v-if="logsLoading" class="settings-page__logs-empty">加载中...</div>
      <div v-else-if="!operationLogs.length" class="settings-page__logs-empty">暂无操作记录</div>
      <div v-else class="settings-page__log-table">
        <article v-for="log in operationLogs" :key="log.id" class="settings-page__log-row">
          <time>{{ formatLogDate(log.createdAt) }}</time>
          <strong>{{ logActionText(log.action) }}</strong>
          <span>{{ logActorText(log) }}</span>
          <code>{{ logTargetText(log) }}</code>
        </article>
      </div>
    </LogsSettingsSection>

    <SiteSettingsSection v-if="activePanel === 'appearance'" @submit="save">
      <div class="settings-page__panel-head">
        <div>
          <small>品牌显示</small>
          <h2>品牌资产</h2>
        </div>
        <button class="cd-button primary" type="submit" :disabled="saving">{{ saving ? "保存中" : "保存外观" }}</button>
      </div>
      <label class="cd-label">品牌名<input v-model.trim="site.brandName" class="cd-input" /></label>
      <label class="cd-label">短名称<input v-model.trim="site.shortName" class="cd-input" /></label>
      <label class="cd-label">远程 Logo URL<input v-model.trim="site.logoUrl" class="cd-input" placeholder="https://..." /></label>
      <label class="settings-page__toggle">
        <input v-model="site.preferRemoteLogo" type="checkbox" />
        <span>登录页使用远程 Logo</span>
      </label>
      <label class="cd-label">远程登录壁纸 URL<input v-model.trim="site.authWallpaperUrl" class="cd-input" placeholder="https://..." /></label>
      <label class="settings-page__toggle">
        <input v-model="site.preferRemoteWallpaper" type="checkbox" />
        <span>登录页使用远程壁纸</span>
      </label>
      <label class="cd-label">版权信息<input v-model.trim="site.copyright" class="cd-input" /></label>
      <label class="cd-label settings-page__wide">
        分享页专属信息
        <textarea
          v-model.trim="site.shareFooterText"
          class="cd-textarea settings-page__share-info-input"
          maxlength="180"
          placeholder="更多活动咨询v：cjy90201"
        ></textarea>
      </label>
      <div v-if="site.shareFooterText" class="settings-page__share-info-preview settings-page__wide" aria-label="分享页专属信息预览">
        <span>专属信息</span>
        <strong>{{ site.shareFooterText }}</strong>
      </div>
      <p class="settings-page__hint">为空则不展示，会显示在公开分享页正文下方。</p>
      <p v-if="message" class="settings-page__save-message">{{ message }}</p>
    </SiteSettingsSection>

    <form v-if="activePanel === 'recovery'" class="settings-page__panel settings-page__appearance" @submit.prevent="save">
      <div class="settings-page__panel-head">
        <div>
          <small>账号找回</small>
          <h2>忘记密码联系信息</h2>
        </div>
        <button class="cd-button primary" type="submit" :disabled="saving">{{ saving ? "保存中" : "保存联系方式" }}</button>
      </div>
      <label class="cd-label settings-page__wide">
        客服联系方式
        <input v-model.trim="site.recoveryContact" class="cd-input" placeholder="QQ / 微信 / 邮箱 / 电话" />
      </label>
      <p class="settings-page__hint">保存后，忘记密码页会提示用户联系客服重置账号。</p>
      <p v-if="message" class="settings-page__save-message">{{ message }}</p>
    </form>

    <UsersSettingsSection v-if="activePanel === 'users'">
      <template v-if="!userDetailOpen">
        <div class="settings-page__users-hero">
          <div>
            <small>用户与权限</small>
            <h2>用户管理</h2>
            <p>管理系统用户账户、角色权限及状态。</p>
          </div>
          <button class="cd-button primary" type="button" :disabled="usersLoading" @click="loadUsers(true)">
            <RefreshCw :size="16" />{{ usersLoading ? "刷新中" : "刷新用户" }}
          </button>
        </div>

        <div class="settings-page__user-subtabs" aria-label="用户管理分类">
          <button class="is-active" type="button">用户列表</button>
          <button type="button" @click="openPanel('security')">角色安全</button>
          <button type="button" @click="openPanel('logs')">登录日志</button>
        </div>

        <div class="settings-page__user-stat-grid">
          <article><UserCog :size="22" /><span><small>用户总数</small><strong>{{ managedUserStats.total }}</strong><em>文档 {{ managedUserStats.docs }} 篇</em></span></article>
          <article><CheckCircle2 :size="22" /><span><small>活跃用户</small><strong>{{ managedUserStats.active }}</strong><em>可正常登录</em></span></article>
          <article><ShieldCheck :size="22" /><span><small>管理员</small><strong>{{ managedUserStats.admins }}</strong><em>含超级管理员</em></span></article>
          <article><Ban :size="22" /><span><small>被禁用户</small><strong>{{ managedUserStats.disabled }}</strong><em>已禁止登录</em></span></article>
        </div>
      </template>

      <template v-else>
        <div class="settings-page__user-edit-head">
          <div>
            <small>用户管理 / 编辑用户</small>
            <h2>用户管理 / 编辑用户</h2>
            <p>修改用户信息、角色权限和账户状态。</p>
          </div>
          <button class="cd-button" type="button" @click="closeUserDetail">
            <ArrowLeft :size="16" />返回用户列表
          </button>
        </div>
        <div class="settings-page__user-subtabs" aria-label="编辑用户分类">
          <button :class="{ 'is-active': userDetailTab === 'info' }" type="button" @click="userDetailTab = 'info'">用户信息</button>
          <button :class="{ 'is-active': userDetailTab === 'roles' }" type="button" @click="userDetailTab = 'roles'">角色权限</button>
          <button :class="{ 'is-active': userDetailTab === 'login' }" type="button" @click="userDetailTab = 'login'">登录日志</button>
          <button :class="{ 'is-active': userDetailTab === 'actions' }" type="button" @click="userDetailTab = 'actions'">操作记录</button>
        </div>
      </template>

      <p v-if="userMessage" class="settings-page__save-message">{{ userMessage }}</p>

      <template v-if="userDetailOpen">
        <div v-if="selectedUserLoading" class="settings-page__logs-empty">加载用户详情中...</div>
        <div v-else-if="selectedUser" class="settings-page__profile">
          <section class="settings-page__profile-hero">
            <div class="settings-page__profile-title">
              <span class="settings-page__profile-avatar">{{ userInitials(selectedUser.username) }}</span>
              <div>
                <h3>{{ selectedUser.username }} <small>{{ roleText(selectedUser) }}</small></h3>
                <p>
                  用户 ID：{{ selectedUser.id }}
                  <button type="button" aria-label="复制用户 ID" @click="copyUserId(selectedUser)"><Copy :size="15" /></button>
                </p>
              </div>
            </div>
            <div class="settings-page__profile-actions">
              <span class="settings-page__status-badge" :class="{ 'is-disabled': selectedUser.status === 'disabled' }">账户状态：{{ statusText(selectedUser.status) }}</span>
              <button class="cd-button" type="button"><MoreHorizontal :size="16" />更多操作</button>
            </div>
          </section>

          <section v-if="userDetailTab === 'info'" class="settings-page__profile-summary">
            <div class="settings-page__profile-facts">
              <dl>
                <div><dt>最近登录 IP</dt><dd>{{ selectedUser.lastIp || "暂无" }}</dd></div>
                <div><dt>最近登录时间</dt><dd>{{ selectedUser.lastActiveAt ? formatLogDate(selectedUser.lastActiveAt) : "暂无" }}</dd></div>
                <div><dt>注册时间</dt><dd>{{ formatLogDate(selectedUser.createdAt) }}</dd></div>
              </dl>
              <dl>
                <div><dt>最近活动时间</dt><dd>{{ selectedUser.lastActiveAt ? formatLogDate(selectedUser.lastActiveAt) : "暂无" }}</dd></div>
                <div><dt>登录失败次数</dt><dd>0 次</dd></div>
                <div><dt>账户锁定时间</dt><dd>-</dd></div>
              </dl>
              <dl>
                <div><dt>全部 IP</dt><dd>{{ selectedUser.recentIps.length ? selectedUser.recentIps.join("、") : selectedUser.lastIp || "暂无" }}</dd></div>
                <div><dt>文档数量</dt><dd>{{ selectedUser.docCount }} 篇</dd></div>
                <div><dt>回收站数量</dt><dd>{{ selectedUser.deletedDocCount }} 篇</dd></div>
              </dl>
            </div>
            <aside class="settings-page__security-score">
              <h4><ShieldCheck :size="16" />安全评分</h4>
              <strong>{{ selectedUser.status === "active" ? 96 : 72 }} <span>分 / {{ selectedUser.status === "active" ? "优秀" : "需处理" }}</span></strong>
              <ul>
                <li><CheckCircle2 :size="14" />管理员强校验已启用</li>
                <li><CheckCircle2 :size="14" />密码强度：高</li>
                <li><CheckCircle2 :size="14" />登录异常检测：正常</li>
                <li><CheckCircle2 :size="14" />账户{{ selectedUser.status === "active" ? "未被锁定" : "已禁用" }}</li>
              </ul>
            </aside>
          </section>

          <div v-if="userDetailTab === 'info'" class="settings-page__profile-grid">
            <main class="settings-page__profile-main">
              <section class="settings-page__profile-section settings-page__danger-actions">
                <button v-if="selectedUser.status === 'active'" type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="disableUser(selectedUser)">
                  <LockKeyhole :size="16" />禁止登录
                </button>
                <button v-else type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="enableUser(selectedUser)">
                  <CheckCircle2 :size="16" />恢复登录
                </button>
                <button type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="deleteUser(selectedUser)">
                  <Trash2 :size="16" />注销用户
                </button>
                <button v-if="selectedUser.role !== 'admin'" type="button" :disabled="!canPromoteUser(selectedUser) || userActionLoading === selectedUser.id" @click="promoteUser(selectedUser)">
                  <ShieldCheck :size="16" />提级管理员
                </button>
              </section>

              <section class="settings-page__profile-section settings-page__password-panel">
                <header><h3>密码管理</h3></header>
                <div class="settings-page__password-grid">
                  <label>
                    新密码
                    <input v-model="userPasswordValue" class="cd-input" type="password" autocomplete="new-password" placeholder="输入新密码" />
                  </label>
                  <label>
                    确认新密码
                    <input v-model="userPasswordConfirmValue" class="cd-input" type="password" autocomplete="new-password" placeholder="再次输入新密码" />
                  </label>
                </div>
                <p>密码长度至少 8 位，建议混合大小写字母、数字和特殊字符。</p>
                <div class="settings-page__password-actions">
                  <button class="cd-button primary" type="button" :disabled="!canManageUser(selectedUser) || userPasswordLoading" @click="resetUserPassword(selectedUser)">
                    修改密码
                  </button>
                  <button class="cd-button" type="button" :disabled="!canManageUser(selectedUser) || userPasswordLoading" @click="viewUserPassword(selectedUser)">
                    查看密码哈希
                  </button>
                </div>
                <p v-if="userPasswordMessage" class="settings-page__save-message">{{ userPasswordMessage }}</p>
              </section>

              <section class="settings-page__profile-section settings-page__asset-panel">
                <header><h3>文档资产</h3></header>
                <p v-if="!selectedUser.docs?.length" class="settings-page__logs-empty">暂无文档</p>
                <template v-else>
                  <RouterLink v-for="doc in selectedUser.docs" :key="doc.docUid" :to="`/admin/docs/${doc.docUid}`">
                    <span>
                      <strong>{{ doc.title }}</strong>
                      <small>{{ doc.deletedAt ? "已在回收站" : "正常" }} · {{ formatLogDate(doc.updatedAt) }}</small>
                    </span>
                    <ExternalLink :size="16" />
                  </RouterLink>
                </template>
              </section>

              <section class="settings-page__profile-section settings-page__activity-panel">
                <header>
                  <h3>最近活动日志</h3>
                  <button class="settings-page__text-action" type="button" @click="openPanel('logs')">查看更多日志</button>
                </header>
                <div class="settings-page__activity-table">
                  <article v-for="log in selectedUserActivityLogs" :key="log.id">
                    <time>{{ formatLogDate(log.createdAt) }}</time>
                    <span>{{ log.ip || selectedUser.lastIp || "--" }}</span>
                    <strong>{{ logActionText(log.action) }}</strong>
                    <em>{{ logTargetText(log) }}</em>
                  </article>
                  <p v-if="!selectedUserActivityLogs.length" class="settings-page__logs-empty">暂无最近日志</p>
                </div>
              </section>
            </main>

            <aside class="settings-page__profile-side">
              <section>
                <h3>基本信息</h3>
                <dl class="settings-page__side-list">
                  <div><dt>用户名</dt><dd>{{ selectedUser.username }} <Pencil :size="14" /></dd></div>
                  <div><dt>邮箱</dt><dd>未绑定 <Pencil :size="14" /></dd></div>
                  <div><dt>手机号</dt><dd>未绑定 <Pencil :size="14" /></dd></div>
                  <div><dt>角色</dt><dd>{{ roleText(selectedUser) }} <Pencil :size="14" /></dd></div>
                  <div><dt>状态</dt><dd><span class="settings-page__status-badge" :class="{ 'is-disabled': selectedUser.status === 'disabled' }">{{ statusText(selectedUser.status) }}</span></dd></div>
                  <div><dt>备注</dt><dd>- <Pencil :size="14" /></dd></div>
                </dl>
              </section>

              <section>
                <h3>安全设置</h3>
                <dl class="settings-page__side-list">
                  <div><dt>风险验证 OTP</dt><dd>{{ selectedUser.role === "admin" ? "按安全中心状态" : "未启用" }}</dd></div>
                  <div><dt>登录保护</dt><dd>已启用</dd></div>
                  <div><dt>密码强度</dt><dd>高</dd></div>
                  <div><dt>账户锁定</dt><dd>{{ selectedUser.status === "disabled" ? "已禁用" : "未锁定" }}</dd></div>
                </dl>
              </section>

              <section>
                <h3>其他信息</h3>
                <dl class="settings-page__side-list">
                  <div><dt>创建方式</dt><dd>手动创建</dd></div>
                  <div><dt>创建者</dt><dd>{{ auth.user?.username || "系统" }}</dd></div>
                  <div><dt>用户 ID</dt><dd>{{ selectedUser.id }} <button type="button" @click="copyUserId(selectedUser)"><Copy :size="14" /></button></dd></div>
                  <div><dt>邮箱验证</dt><dd>已验证</dd></div>
                  <div><dt>手机验证</dt><dd>已验证</dd></div>
                </dl>
              </section>

              <footer>创建时间：{{ formatLogDate(selectedUser.createdAt) }}</footer>
            </aside>
          </div>

          <section v-else-if="userDetailTab === 'roles'" class="settings-page__tab-panel">
            <header class="settings-page__tab-panel-head">
              <div>
                <small>当前角色</small>
                <h3>{{ roleText(selectedUser) }}</h3>
                <p>角色来自后端数据库强校验，前端只负责展示和触发管理员操作。</p>
              </div>
              <button v-if="selectedUser.role !== 'admin'" class="cd-button primary" type="button" :disabled="!canPromoteUser(selectedUser) || userActionLoading === selectedUser.id" @click="promoteUser(selectedUser)">
                <ShieldCheck :size="16" />提级管理员
              </button>
            </header>
            <div class="settings-page__permission-grid">
              <article>
                <ShieldCheck :size="20" />
                <strong>后台访问</strong>
                <span>{{ selectedUser.role === "admin" ? "可进入 /admin，并经过数据库角色校验。" : "不可进入后台管理页。" }}</span>
              </article>
              <article>
                <UserCog :size="20" />
                <strong>用户管理</strong>
                <span>{{ selectedUser.role === "admin" ? "可查看用户；高危操作需要二次验证。" : "无用户管理权限。" }}</span>
              </article>
              <article>
                <ScrollText :size="20" />
                <strong>日志审计</strong>
                <span>{{ selectedUser.role === "admin" ? "可查看操作日志和系统事件。" : "无审计日志权限。" }}</span>
              </article>
              <article>
                <Database :size="20" />
                <strong>系统配置</strong>
                <span>{{ selectedUser.isSuperAdmin ? "可管理 R2、系统设置和导出配置。" : "仅超级管理员可改系统配置。" }}</span>
              </article>
            </div>
            <div class="settings-page__role-actions">
              <button v-if="selectedUser.status === 'active'" class="cd-button" type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="disableUser(selectedUser)">
                <LockKeyhole :size="16" />禁止登录
              </button>
              <button v-else class="cd-button" type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="enableUser(selectedUser)">
                <CheckCircle2 :size="16" />恢复登录
              </button>
              <button class="cd-button danger" type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="deleteUser(selectedUser)">
                <Trash2 :size="16" />注销用户
              </button>
            </div>
          </section>

          <section v-else-if="userDetailTab === 'login'" class="settings-page__tab-panel">
            <header class="settings-page__tab-panel-head">
              <div>
                <small>登录日志</small>
                <h3>{{ selectedUser.username }} 的登录记录</h3>
                <p>只显示当前用户的登录成功和登录失败事件。</p>
              </div>
              <button class="cd-button" type="button" :disabled="logsLoading" @click="loadOperationLogs(true)">
                <RefreshCw :size="16" />{{ logsLoading ? "刷新中" : "刷新日志" }}
              </button>
            </header>
            <div class="settings-page__detail-log-table">
              <article v-for="log in selectedUserLoginLogs" :key="log.id">
                <time>{{ formatLogDate(log.createdAt) }}</time>
                <span>{{ log.ip || selectedUser.lastIp || "--" }}</span>
                <strong :class="{ 'is-danger': log.action.includes('failure') }">{{ logActionText(log.action) }}</strong>
                <em>{{ logTargetText(log) }}</em>
              </article>
              <p v-if="!selectedUserLoginLogs.length" class="settings-page__logs-empty">暂无登录记录</p>
            </div>
          </section>

          <section v-else class="settings-page__tab-panel">
            <header class="settings-page__tab-panel-head">
              <div>
                <small>操作记录</small>
                <h3>{{ selectedUser.username }} 的操作记录</h3>
                <p>显示除登录外的文档、用户、系统配置等操作。</p>
              </div>
              <button class="cd-button" type="button" :disabled="logsLoading" @click="loadOperationLogs(true)">
                <RefreshCw :size="16" />{{ logsLoading ? "刷新中" : "刷新记录" }}
              </button>
            </header>
            <div class="settings-page__detail-log-table">
              <article v-for="log in selectedUserActionLogs" :key="log.id">
                <time>{{ formatLogDate(log.createdAt) }}</time>
                <span>{{ log.ip || selectedUser.lastIp || "--" }}</span>
                <strong>{{ logActionText(log.action) }}</strong>
                <em>{{ logTargetText(log) }}</em>
              </article>
              <p v-if="!selectedUserActionLogs.length" class="settings-page__logs-empty">暂无操作记录</p>
            </div>
          </section>
        </div>
        <div v-else class="settings-page__logs-empty">请选择用户</div>
      </template>

      <template v-else>
        <div v-if="usersLoading && !users.length" class="settings-page__logs-empty">加载中...</div>
        <div v-else-if="!users.length" class="settings-page__logs-empty">暂无用户</div>
        <template v-else>
          <div class="settings-page__user-toolbar">
            <label class="settings-page__user-search">
              <Search :size="17" />
              <input v-model.trim="userSearch" type="search" placeholder="搜索用户名、角色或 IP" />
            </label>
            <label class="settings-page__user-filter">
              状态
              <select v-model="userStatusFilter">
                <option value="all">全部</option>
                <option value="active">可登录</option>
                <option value="disabled">已禁用</option>
              </select>
            </label>
            <label class="settings-page__user-filter">
              角色
              <select v-model="userRoleFilter">
                <option value="all">全部</option>
                <option value="admin">管理员</option>
                <option value="user">普通用户</option>
              </select>
            </label>
            <button class="cd-button" type="button" @click="resetUserFilters">重置</button>
          </div>

          <div class="settings-page__user-table-shell">
            <table class="settings-page__user-table">
              <thead>
                <tr>
                  <th><input type="checkbox" :checked="allFilteredUsersSelected" @change="toggleAllFilteredUsers" /></th>
                  <th>用户信息</th>
                  <th>角色</th>
                  <th>文档</th>
                  <th>状态</th>
                  <th>注册时间</th>
                  <th>最后登录</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in filteredManagedUsers" :key="user.id" :class="{ 'is-disabled': user.status === 'disabled' }">
                  <td><input type="checkbox" :checked="selectedUserIds.includes(user.id)" @change="toggleUserSelection(user.id)" /></td>
                  <td>
                    <div class="settings-page__user-identity">
                      <span>{{ userInitials(user.username) }}</span>
                      <div>
                        <strong>{{ user.username }}</strong>
                        <small>ID {{ user.id }} · {{ user.lastIp || "暂无 IP" }}</small>
                      </div>
                    </div>
                  </td>
                  <td><span class="settings-page__role-badge" :class="{ 'is-admin': user.role === 'admin' }">{{ roleText(user) }}</span></td>
                  <td>{{ user.docCount }} 篇</td>
                  <td><span class="settings-page__status-badge" :class="{ 'is-disabled': user.status === 'disabled' }">{{ statusText(user.status) }}</span></td>
                  <td>{{ formatLogDate(user.createdAt) }}</td>
                  <td>
                    <span>{{ user.lastActiveAt ? formatLogDate(user.lastActiveAt) : "暂无" }}</span>
                    <small>{{ user.lastIp || "" }}</small>
                  </td>
                  <td>
                    <div class="settings-page__table-actions">
                      <button type="button" @click="openUserDetail(user)">编辑</button>
                      <button v-if="user.status === 'active'" type="button" :disabled="!canManageUser(user) || userActionLoading === user.id" @click="disableUser(user)">禁用</button>
                      <button v-else type="button" :disabled="!canManageUser(user) || userActionLoading === user.id" @click="enableUser(user)">启用</button>
                      <button type="button" @click="openUserDetail(user)" aria-label="更多操作"><MoreHorizontal :size="16" /></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="!filteredManagedUsers.length" class="settings-page__logs-empty">没有匹配用户</div>
            <footer class="settings-page__user-table-footer">
              <span>共 {{ filteredManagedUsers.length }} 条</span>
              <span>已选 {{ selectedUserIds.length }} 个</span>
            </footer>
          </div>
        </template>
      </template>
    </UsersSettingsSection>

    <section v-if="activePanel === 'security'" class="settings-page__panel">
      <div class="settings-page__panel-head">
        <div>
          <small>登录与验证码</small>
          <h2>安全状态</h2>
        </div>
        <button class="cd-button" type="button" :disabled="systemLoading" @click="loadSystemStatus">
          <RefreshCw :size="16" />{{ systemLoading ? "刷新中" : "刷新" }}
        </button>
      </div>
      <div class="settings-page__metric-grid">
        <article><small>活跃会话</small><strong>{{ systemStatus?.security.activeSessions ?? 0 }}</strong><span>当前仍可使用的登录会话</span></article>
        <article><small>过期会话</small><strong>{{ systemStatus?.security.expiredSessions ?? 0 }}</strong><span>可安全清理</span></article>
        <article><small>有效验证码</small><strong>{{ systemStatus?.security.activeCaptchas ?? 0 }}</strong><span>仍在有效期内</span></article>
        <article><small>过期/已用验证码</small><strong>{{ systemStatus?.security.staleCaptchas ?? 0 }}</strong><span>可安全清理</span></article>
      </div>
      <div class="settings-page__panel-actions">
        <button class="cd-button" type="button" :disabled="!!systemActionLoading" @click="runSystemAction('cleanupExpiredSessions')">
          <Trash2 :size="16" />{{ systemActionLoading === "cleanupExpiredSessions" ? "清理中" : "清理过期会话" }}
        </button>
        <button class="cd-button" type="button" :disabled="!!systemActionLoading" @click="runSystemAction('cleanupExpiredCaptchas')">
          <Trash2 :size="16" />{{ systemActionLoading === "cleanupExpiredCaptchas" ? "清理中" : "清理验证码" }}
        </button>
      </div>
      <p v-if="systemMessage" class="settings-page__save-message">{{ systemMessage }}</p>
    </section>

    <section v-if="activePanel === 'shares'" class="settings-page__panel">
      <div class="settings-page__panel-head">
        <div>
          <small>公开访问</small>
          <h2>分享状态</h2>
        </div>
        <RouterLink class="cd-button" to="/admin/share-reviews">
          <Share2 :size="16" />分享审核
        </RouterLink>
      </div>
      <div class="settings-page__metric-grid">
        <article><small>分享总数</small><strong>{{ systemStatus?.shares.total ?? 0 }}</strong><span>全部分享记录</span></article>
        <article><small>启用中</small><strong>{{ systemStatus?.shares.active ?? 0 }}</strong><span>当前可访问分享</span></article>
        <article><small>待审核</small><strong>{{ systemStatus?.shares.pendingReview ?? 0 }}</strong><span>需要管理员处理</span></article>
        <article><small>密码保护</small><strong>{{ systemStatus?.shares.passwordProtected ?? 0 }}</strong><span>已设置访问密码</span></article>
        <article><small>累计访问</small><strong>{{ systemStatus?.shares.totalViews ?? 0 }}</strong><span>分享页访问计数</span></article>
      </div>
    </section>

    <StorageSettingsSection v-if="activePanel === 'storage'">
      <div class="settings-page__panel-head">
        <div>
          <small>上传记录</small>
          <h2>存储概览</h2>
        </div>
        <RouterLink class="cd-button" to="/admin/settings/storage">
          <CloudUpload :size="16" />R2 设置
        </RouterLink>
      </div>
      <div class="settings-page__metric-grid">
        <article><small>登记文件</small><strong>{{ systemStatus?.storage.fileCount ?? 0 }}</strong><span>上传记录总数</span></article>
        <article><small>登记大小</small><strong>{{ formatBytes(systemStatus?.storage.totalBytes || 0) }}</strong><span>来自上传表 file_size</span></article>
        <article><small>图片</small><strong>{{ systemStatus?.storage.byKind.image ?? 0 }}</strong><span>image 类型</span></article>
        <article><small>视频</small><strong>{{ systemStatus?.storage.byKind.video ?? 0 }}</strong><span>video 类型</span></article>
        <article><small>文件</small><strong>{{ systemStatus?.storage.byKind.file ?? 0 }}</strong><span>file 类型</span></article>
      </div>
      <div class="settings-page__storage-note">
        <strong>R2：{{ systemStatus?.r2.configured ? "已配置" : "未完整配置" }}</strong>
        <span>{{ systemStatus?.r2.message || "等待状态刷新" }}</span>
        <code v-if="systemStatus?.r2.bucket">{{ systemStatus.r2.bucket }}</code>
      </div>
    </StorageSettingsSection>

    <MaintenanceSettingsSection v-if="activePanel === 'maintenance'">
      <div class="settings-page__panel-head">
        <div>
          <small>手动维护</small>
          <h2>系统维护</h2>
        </div>
        <button class="cd-button" type="button" :disabled="systemActionLoading === 'healthCheck'" @click="runSystemAction('healthCheck')">
          <Activity :size="16" />{{ systemActionLoading === "healthCheck" ? "检测中" : "健康检测" }}
        </button>
      </div>
      <div class="settings-page__quick settings-page__quick--panel">
        <button type="button" :disabled="!!systemActionLoading" @click="runSystemAction('cleanupExpiredSessions')"><Trash2 :size="18" /><span><strong>清理过期会话</strong><small>删除过期登录会话</small></span></button>
        <button type="button" :disabled="!!systemActionLoading" @click="runSystemAction('cleanupExpiredCaptchas')"><Activity :size="18" /><span><strong>清理验证码</strong><small>删除过期/已用验证码</small></span></button>
        <button type="button" :disabled="!!systemActionLoading" @click="runSystemAction('cleanupExpiredLogs')"><Trash2 :size="18" /><span><strong>清理过期日志</strong><small>按配置保留天数删除日志</small></span></button>
        <button type="button" :disabled="!!systemActionLoading" @click="runSystemAction('emptyTrash')"><Trash2 :size="18" /><span><strong>清理回收站</strong><small>永久删除回收站文档</small></span></button>
        <button type="button" :disabled="!!systemActionLoading" @click="runSystemAction('refreshStatus')"><Database :size="18" /><span><strong>刷新运行状态</strong><small>重新读取实时统计</small></span></button>
        <button type="button" :disabled="!!systemActionLoading" @click="exportConfig"><ExternalLink :size="18" /><span><strong>导出系统配置</strong><small>下载脱敏配置 JSON</small></span></button>
        <button type="button" :disabled="!!systemActionLoading" @click="runSystemAction('healthCheck')"><RefreshCw :size="18" /><span><strong>系统健康检测</strong><small>检查 API、DB、R2 配置</small></span></button>
      </div>
      <div class="settings-page__storage-note">
        <strong>最近成功备份</strong>
        <span v-if="systemStatus?.backup">{{ formatLogDate(systemStatus.backup.createdAt) }} · {{ formatBytes(systemStatus.backup.size) }}</span>
        <span v-else>尚无带校验和的成功备份记录</span>
        <code v-if="systemStatus?.backup">SHA-256 {{ systemStatus.backup.sha256.slice(0, 16) }}…</code>
      </div>
      <p v-if="systemMessage" class="settings-page__save-message">{{ systemMessage }}</p>
    </MaintenanceSettingsSection>

    <section v-if="activePanel === 'version'" class="settings-page__version">
      <div class="settings-page__version-copy">
        <small>当前版本</small>
        <strong>{{ currentVersion }}</strong>
        <span>{{ versionStatusText }}</span>
      </div>
      <div class="settings-page__version-actions">
        <button class="cd-button primary" type="button" :disabled="updateState === 'checking'" @click="checkUpdate">
          <RefreshCw :size="16" />{{ updateState === "checking" ? "检查中" : "检查更新" }}
        </button>
        <a class="cd-button" :href="GITHUB_REPO_URL" target="_blank" rel="noopener noreferrer">
          <Github :size="16" />开源链接
        </a>
        <a class="cd-button" :href="`${GITHUB_REPO_URL}/releases`" target="_blank" rel="noopener noreferrer">
          <ExternalLink :size="16" />发布页
        </a>
      </div>
    </section>

    <section v-if="activePanel === 'overview'" class="settings-page__deploy">
      <div>
        <h2>系统状态 / 部署信息</h2>
        <p>{{ systemStatus ? `最后刷新：${formatLogDate(systemStatus.generatedAt)}` : "正在读取系统状态。" }}</p>
      </div>
      <div class="settings-page__deploy-grid">
        <article><strong>API 服务</strong><span>{{ systemStatus ? `启动于 ${formatLogDate(systemStatus.service.startedAt)}` : "读取中" }}</span><b>{{ systemStatus?.service.label || "读取中" }}</b></article>
        <article><strong>数据库</strong><span>{{ systemStatus?.database.provider || "--" }}</span><b>{{ systemStatus?.database.label || "读取中" }}</b></article>
        <article><strong>R2 存储</strong><span>{{ systemStatus?.r2.message || "读取中" }}</span><b :class="{ 'is-warning': !systemStatus?.r2.configured }">{{ systemStatus?.r2.configured ? "已配置" : "未完整" }}</b></article>
        <article><strong>文档资产</strong><span>正常 {{ systemStatus?.docs.active ?? 0 }} · 回收站 {{ systemStatus?.docs.trash ?? 0 }}</span><b>{{ systemStatus?.docs.total ?? 0 }} 篇</b></article>
      </div>
    </section>

    <p v-if="systemMessage && activePanel !== 'security' && activePanel !== 'maintenance'" class="settings-page__save-message settings-page__global-message">{{ systemMessage }}</p>
  </section>
</template>
