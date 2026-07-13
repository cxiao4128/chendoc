<script setup lang="ts">
import { Activity, CloudUpload, Database, RefreshCw, ScrollText, Server, ShieldCheck, Wrench } from "lucide-vue-next";
import type { OperationLogView, SystemStatusView } from "@/services/api";

type OverviewPanel = "logs" | "security" | "maintenance" | "version";

defineProps<{
  currentVersion: string;
  versionStatusText: string;
  systemStatus: SystemStatusView | null;
  securitySummaryText: string;
  recentOperationLogs: OperationLogView[];
  logsLoading: boolean;
  storageUsagePercent: number;
  formatUptime: (seconds?: number) => string;
  formatBytes: (value?: number) => string;
  formatLogDate: (value: string) => string;
  logTrendText: () => string;
  logActionText: (action: string) => string;
  logActorText: (log: OperationLogView) => string;
}>();

defineEmits<{
  openPanel: [panel: OverviewPanel];
}>();
</script>

<template>
  <section class="settings-page__overview">
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
        <button class="settings-page__text-action" type="button" @click="$emit('openPanel', 'security')">查看安全策略</button>
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
        <button class="settings-page__text-action" type="button" @click="$emit('openPanel', 'version')">查看版本更新</button>
      </article>
    </div>

    <div class="settings-page__overview-bottom">
      <article class="settings-page__panel settings-page__recent-panel">
        <header class="settings-page__inline-head">
          <div><small>最近操作日志</small><h2>关键事件</h2></div>
          <button class="settings-page__text-action" type="button" @click="$emit('openPanel', 'logs')">查看全部日志</button>
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
        <button type="button" @click="$emit('openPanel', 'security')"><ShieldCheck :size="18" /><span><strong>清理登录与验证码</strong><small>过期会话和验证码保持低水位。</small></span></button>
        <RouterLink to="/admin/settings/storage"><Database :size="18" /><span><strong>检查 R2 配置</strong><small>确保上传、分享图片和文件可用。</small></span></RouterLink>
        <button type="button" @click="$emit('openPanel', 'maintenance')"><Wrench :size="18" /><span><strong>执行系统健康检测</strong><small>快速检查 API、DB、R2 状态。</small></span></button>
        <button type="button" @click="$emit('openPanel', 'version')"><RefreshCw :size="18" /><span><strong>检查系统更新</strong><small>当前版本 {{ currentVersion }}。</small></span></button>
      </article>
    </div>

    <section class="settings-page__deploy">
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
  </section>
</template>
