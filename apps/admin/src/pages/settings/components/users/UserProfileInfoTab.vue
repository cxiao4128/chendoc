<script setup lang="ts">
import { CheckCircle2, Copy, ExternalLink, LockKeyhole, MoreHorizontal, Pencil, ShieldCheck, Trash2 } from "lucide-vue-next";
import type { ManagedUserView, OperationLogView } from "@/services/api";

defineProps<{
  selectedUser: ManagedUserView;
  userActionLoading: number | null;
  userPasswordValue: string;
  userPasswordConfirmValue: string;
  userPasswordMessage: string;
  userPasswordLoading: boolean;
  selectedUserActivityLogs: OperationLogView[];
  currentUsername: string;
  formatLogDate: (value: string) => string;
  logActionText: (action: string) => string;
  logTargetText: (log: OperationLogView) => string;
  roleText: (user: Pick<ManagedUserView, "role" | "isSuperAdmin">) => string;
  statusText: (status: "active" | "disabled") => string;
  userInitials: (username: string) => string;
  canPromoteUser: (user: ManagedUserView) => boolean;
  canManageUser: (user: ManagedUserView) => boolean;
}>();

defineEmits<{
  copyUserId: [user: ManagedUserView];
  disableUser: [user: ManagedUserView];
  enableUser: [user: ManagedUserView];
  deleteUser: [user: ManagedUserView];
  promoteUser: [user: ManagedUserView];
  resetUserPassword: [user: ManagedUserView];
  viewUserPassword: [user: ManagedUserView];
  openPanel: [panel: "logs"];
  "update:userPasswordValue": [value: string];
  "update:userPasswordConfirmValue": [value: string];
}>();

function inputValue(event: Event) {
  return (event.target as HTMLInputElement).value;
}
</script>

<template>
  <section class="settings-page__profile-hero">
    <div class="settings-page__profile-title">
      <span class="settings-page__profile-avatar">{{ userInitials(selectedUser.username) }}</span>
      <div>
        <h3>{{ selectedUser.username }} <small>{{ roleText(selectedUser) }}</small></h3>
        <p>
          用户 ID：{{ selectedUser.id }}
          <button type="button" aria-label="复制用户 ID" @click="$emit('copyUserId', selectedUser)"><Copy :size="15" /></button>
        </p>
      </div>
    </div>
    <div class="settings-page__profile-actions">
      <span class="settings-page__status-badge" :class="{ 'is-disabled': selectedUser.status === 'disabled' }">账户状态：{{ statusText(selectedUser.status) }}</span>
      <button class="cd-button" type="button"><MoreHorizontal :size="16" />更多操作</button>
    </div>
  </section>

  <section class="settings-page__profile-summary">
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

  <div class="settings-page__profile-grid">
    <main class="settings-page__profile-main">
      <section class="settings-page__profile-section settings-page__danger-actions">
        <button v-if="selectedUser.status === 'active'" type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="$emit('disableUser', selectedUser)">
          <LockKeyhole :size="16" />禁止登录
        </button>
        <button v-else type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="$emit('enableUser', selectedUser)">
          <CheckCircle2 :size="16" />恢复登录
        </button>
        <button type="button" :disabled="!canManageUser(selectedUser) || userActionLoading === selectedUser.id" @click="$emit('deleteUser', selectedUser)">
          <Trash2 :size="16" />注销用户
        </button>
        <button v-if="selectedUser.role !== 'admin'" type="button" :disabled="!canPromoteUser(selectedUser) || userActionLoading === selectedUser.id" @click="$emit('promoteUser', selectedUser)">
          <ShieldCheck :size="16" />提级管理员
        </button>
      </section>

      <section class="settings-page__profile-section settings-page__password-panel">
        <header><h3>密码管理</h3></header>
        <div class="settings-page__password-grid">
          <label>
            新密码
            <input :value="userPasswordValue" class="cd-input" type="password" autocomplete="new-password" placeholder="输入新密码" @input="$emit('update:userPasswordValue', inputValue($event))" />
          </label>
          <label>
            确认新密码
            <input :value="userPasswordConfirmValue" class="cd-input" type="password" autocomplete="new-password" placeholder="再次输入新密码" @input="$emit('update:userPasswordConfirmValue', inputValue($event))" />
          </label>
        </div>
        <p>密码长度至少 8 位，建议混合大小写字母、数字和特殊字符。</p>
        <div class="settings-page__password-actions">
          <button class="cd-button primary" type="button" :disabled="!canManageUser(selectedUser) || userPasswordLoading" @click="$emit('resetUserPassword', selectedUser)">
            修改密码
          </button>
          <button class="cd-button" type="button" :disabled="!canManageUser(selectedUser) || userPasswordLoading" @click="$emit('viewUserPassword', selectedUser)">
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
          <button class="settings-page__text-action" type="button" @click="$emit('openPanel', 'logs')">查看更多日志</button>
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
          <div><dt>创建者</dt><dd>{{ currentUsername || "系统" }}</dd></div>
          <div><dt>用户 ID</dt><dd>{{ selectedUser.id }} <button type="button" @click="$emit('copyUserId', selectedUser)"><Copy :size="14" /></button></dd></div>
          <div><dt>邮箱验证</dt><dd>已验证</dd></div>
          <div><dt>手机验证</dt><dd>已验证</dd></div>
        </dl>
      </section>

      <footer>创建时间：{{ formatLogDate(selectedUser.createdAt) }}</footer>
    </aside>
  </div>
</template>
