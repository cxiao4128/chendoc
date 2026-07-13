<script setup lang="ts">
import { MoreHorizontal, Search } from "lucide-vue-next";
import type { ManagedUserView } from "@/services/api";

type UserRoleFilter = "all" | "admin" | "user";
type UserStatusFilter = "all" | "active" | "disabled";

defineProps<{
  users: ManagedUserView[];
  usersLoading: boolean;
  userSearch: string;
  userRoleFilter: UserRoleFilter;
  userStatusFilter: UserStatusFilter;
  selectedUserIds: number[];
  filteredManagedUsers: ManagedUserView[];
  allFilteredUsersSelected: boolean;
  userActionLoading: number | null;
  formatLogDate: (value: string) => string;
  roleText: (user: Pick<ManagedUserView, "role" | "isSuperAdmin">) => string;
  statusText: (status: "active" | "disabled") => string;
  userInitials: (username: string) => string;
  canManageUser: (user: ManagedUserView) => boolean;
}>();

const emit = defineEmits<{
  "update:userSearch": [value: string];
  "update:userRoleFilter": [value: UserRoleFilter];
  "update:userStatusFilter": [value: UserStatusFilter];
  resetUserFilters: [];
  toggleUserSelection: [id: number];
  toggleAllFilteredUsers: [];
  openUserDetail: [user: ManagedUserView];
  disableUser: [user: ManagedUserView];
  enableUser: [user: ManagedUserView];
}>();

function inputValue(event: Event) {
  return (event.target as HTMLInputElement).value;
}

function updateUserStatusFilter(event: Event) {
  const value = (event.target as HTMLSelectElement).value as UserStatusFilter;
  emit("update:userStatusFilter", value);
}

function updateUserRoleFilter(event: Event) {
  const value = (event.target as HTMLSelectElement).value as UserRoleFilter;
  emit("update:userRoleFilter", value);
}
</script>

<template>
  <div v-if="usersLoading && !users.length" class="settings-page__logs-empty">加载中...</div>
  <div v-else-if="!users.length" class="settings-page__logs-empty">暂无用户</div>
  <template v-else>
    <div class="settings-page__user-toolbar">
      <label class="settings-page__user-search">
        <Search :size="17" />
        <input :value="userSearch" type="search" placeholder="搜索用户名、角色或 IP" @input="$emit('update:userSearch', inputValue($event).trim())" />
      </label>
      <label class="settings-page__user-filter">
        状态
        <select :value="userStatusFilter" @change="updateUserStatusFilter">
          <option value="all">全部</option>
          <option value="active">可登录</option>
          <option value="disabled">已禁用</option>
        </select>
      </label>
      <label class="settings-page__user-filter">
        角色
        <select :value="userRoleFilter" @change="updateUserRoleFilter">
          <option value="all">全部</option>
          <option value="admin">管理员</option>
          <option value="user">普通用户</option>
        </select>
      </label>
      <button class="cd-button" type="button" @click="$emit('resetUserFilters')">重置</button>
    </div>

    <div class="settings-page__user-table-shell">
      <table class="settings-page__user-table">
        <thead>
          <tr>
            <th><input type="checkbox" :checked="allFilteredUsersSelected" @change="$emit('toggleAllFilteredUsers')" /></th>
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
            <td><input type="checkbox" :checked="selectedUserIds.includes(user.id)" @change="$emit('toggleUserSelection', user.id)" /></td>
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
                <button type="button" @click="$emit('openUserDetail', user)">编辑</button>
                <button v-if="user.status === 'active'" type="button" :disabled="!canManageUser(user) || userActionLoading === user.id" @click="$emit('disableUser', user)">禁用</button>
                <button v-else type="button" :disabled="!canManageUser(user) || userActionLoading === user.id" @click="$emit('enableUser', user)">启用</button>
                <button type="button" @click="$emit('openUserDetail', user)" aria-label="更多操作"><MoreHorizontal :size="16" /></button>
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
