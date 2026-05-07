<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  ArchiveRestore,
  ExternalLink,
  Github,
  KeyRound,
  Paintbrush,
  RefreshCw,
  ScrollText,
  Server,
  Trash2
} from "lucide-vue-next";
import { getSiteConfigApi, listOperationLogsApi, saveSiteConfigApi, type OperationLogView } from "../../api/settings";
import { defaultRemoteLogoUrl, defaultRemoteWallpaperUrl } from "../../config/site-assets";
import { useIsMobileViewport } from "../../composables/useViewport";
import "./settings.css";

type ActivePanel = "logs" | "appearance" | null;
type UpdateState = "idle" | "checking" | "latest" | "outdated" | "error";

const APP_VERSION = "v1.01";
const GITHUB_REPO_URL = "https://github.com/cxiao4128/chendoc";
const GITHUB_API_BASE = "https://api.github.com/repos/cxiao4128/chendoc";
const GITHUB_RAW_PACKAGE_URL = "https://raw.githubusercontent.com/cxiao4128/chendoc/main/package.json";

const actionTextMap: Record<string, string> = {
  "auth.login.failure": "登录失败",
  "auth.register.success": "注册账号",
  "auth.register.failure": "注册失败",
  "auth.password.change": "修改密码",
  "danger.doc.delete": "删除文档",
  "doc.create": "新建文档",
  "doc.soft_delete": "移入回收站",
  "doc.restore": "恢复文档",
  "doc.hard_delete": "永久删除文档",
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
  "share.create": "创建分享",
  "share.update": "更新分享",
  "share.delete": "删除分享",
  "share.review.approve": "通过分享审核",
  "share.review.reject": "拒绝分享审核"
};

const targetTextMap: Record<string, string> = {
  auth: "认证",
  doc: "文档",
  invite: "注册卡密",
  settings: "设置",
  share: "分享",
  user: "用户"
};

const targetIdTextMap: Record<string, string> = {
  login: "登录",
  register: "注册",
  r2: "R2 配置",
  site: "站点外观"
};

const site = reactive({
  brandName: "陈书 / ChensDoc",
  shortName: "陈书",
  logoUrl: defaultRemoteLogoUrl,
  authWallpaperUrl: defaultRemoteWallpaperUrl,
  preferRemoteLogo: false,
  preferRemoteWallpaper: false,
  copyright: "Copyright © 2026 陈书. All rights reserved"
});
const saving = ref(false);
const message = ref("");
const isMobile = useIsMobileViewport();
const activePanel = ref<ActivePanel>(null);
const operationLogs = ref<OperationLogView[]>([]);
const logsLoading = ref(false);
const logsLoaded = ref(false);
const updateState = ref<UpdateState>("idle");
const updateMessage = ref("");

const versionStatusText = computed(() => {
  if (updateState.value === "checking") return "正在检查 GitHub 版本";
  if (updateState.value === "latest") return updateMessage.value || "当前版本已与 GitHub 保持一致";
  if (updateState.value === "outdated") return updateMessage.value;
  if (updateState.value === "error") return updateMessage.value || "暂时无法检查更新";
  return "可与 GitHub 最新版本进行比对";
});

async function load() {
  const response = await getSiteConfigApi();
  Object.assign(site, response.config);
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
  activePanel.value = activePanel.value === panel ? null : panel;
  if (activePanel.value === "logs") void loadOperationLogs();
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

function canonicalVersion(value: string) {
  const raw = value.trim().toLowerCase().replace(/^v/, "");
  if (raw === "1.01") return "1.0.1";
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
    if (canonicalVersion(remoteVersion) === canonicalVersion(APP_VERSION)) {
      updateState.value = "latest";
      updateMessage.value = `已是最新版本，GitHub 当前也是 ${remoteVersion}`;
    } else {
      updateState.value = "outdated";
      updateMessage.value = `GitHub 最新为 ${remoteVersion}，当前为 ${APP_VERSION}`;
    }
  } catch (error) {
    updateState.value = "error";
    updateMessage.value = error instanceof Error ? error.message : "检查更新失败，请稍后重试";
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <section class="settings-page" :class="{ 'is-mobile': isMobile }">
    <header class="settings-page__head">
      <div>
        <span>系统维护</span>
        <h1>后台管理</h1>
      </div>
    </header>

    <div class="settings-page__grid">
      <RouterLink class="settings-page__card" to="/admin/invites">
        <KeyRound :size="21" />
        <div><strong>注册卡密</strong><span>生成、禁用、删除一次性注册卡密</span></div>
      </RouterLink>
      <RouterLink class="settings-page__card" to="/admin/settings/storage">
        <Server :size="21" />
        <div><strong>R2 设置</strong><span>对象存储连接、密钥加密入库、上传测试</span></div>
      </RouterLink>
      <RouterLink class="settings-page__card" to="/admin/article-delete">
        <Trash2 :size="21" />
        <div><strong>文章删除</strong><span>输入文章 ID 查询并软删除文章</span></div>
      </RouterLink>
      <RouterLink class="settings-page__card" to="/admin/trash">
        <ArchiveRestore :size="21" />
        <div><strong>回收站</strong><span>恢复软删除文章，或执行永久删除</span></div>
      </RouterLink>
      <button class="settings-page__card" :class="{ 'is-active': activePanel === 'logs' }" type="button" @click="openPanel('logs')">
        <ScrollText :size="21" />
        <div><strong>操作日志</strong><span>查看最近管理动作、操作者和对象</span></div>
      </button>
      <button class="settings-page__card" :class="{ 'is-active': activePanel === 'appearance' }" type="button" @click="openPanel('appearance')">
        <Paintbrush :size="21" />
        <div><strong>站点外观</strong><span>调整品牌、Logo、登录壁纸和版权信息</span></div>
      </button>
    </div>

    <section v-if="activePanel === 'logs'" class="settings-page__panel">
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
    </section>

    <form v-if="activePanel === 'appearance'" class="settings-page__panel settings-page__appearance" @submit.prevent="save">
      <div class="settings-page__panel-head">
        <div>
          <small>品牌显示</small>
          <h2>站点外观</h2>
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
      <p v-if="message" class="settings-page__save-message">{{ message }}</p>
    </form>

    <section class="settings-page__version">
      <div class="settings-page__version-copy">
        <small>当前版本</small>
        <strong>{{ APP_VERSION }}</strong>
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
  </section>
</template>
