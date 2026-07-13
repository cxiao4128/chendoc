<script setup lang="ts">
import type { ManagedUserView, OperationLogView } from "@/services/api";
import type { UserDetailTab } from "../../../features/settings/hooks/useManagedUsers";
import UserDetailHeader from "./users/UserDetailHeader.vue";
import UserListSection from "./users/UserListSection.vue";
import UserOverviewHeader from "./users/UserOverviewHeader.vue";
import UserProfileInfoTab from "./users/UserProfileInfoTab.vue";
import UserProfileLogsTab from "./users/UserProfileLogsTab.vue";
import UserProfileRolesTab from "./users/UserProfileRolesTab.vue";

type UserPanelRoute = "security" | "logs";
type UserRoleFilter = "all" | "admin" | "user";
type UserStatusFilter = "all" | "active" | "disabled";

interface ManagedUserStats {
  total: number;
  active: number;
  admins: number;
  disabled: number;
  docs: number;
}

defineProps<{
  users: ManagedUserView[];
  usersLoading: boolean;
  userSearch: string;
  userRoleFilter: UserRoleFilter;
  userStatusFilter: UserStatusFilter;
  selectedUserIds: number[];
  selectedUser: ManagedUserView | null;
  userDetailOpen: boolean;
  userDetailTab: UserDetailTab;
  selectedUserLoading: boolean;
  userActionLoading: number | null;
  userMessage: string;
  userPasswordValue: string;
  userPasswordConfirmValue: string;
  userPasswordMessage: string;
  userPasswordLoading: boolean;
  filteredManagedUsers: ManagedUserView[];
  managedUserStats: ManagedUserStats;
  allFilteredUsersSelected: boolean;
  selectedUserActivityLogs: OperationLogView[];
  selectedUserLoginLogs: OperationLogView[];
  selectedUserActionLogs: OperationLogView[];
  currentUsername: string;
  logsLoading: boolean;
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
  "update:userSearch": [value: string];
  "update:userRoleFilter": [value: UserRoleFilter];
  "update:userStatusFilter": [value: UserStatusFilter];
  "update:userDetailTab": [value: UserDetailTab];
  "update:userPasswordValue": [value: string];
  "update:userPasswordConfirmValue": [value: string];
  refreshUsers: [force: boolean];
  openPanel: [panel: UserPanelRoute];
  closeUserDetail: [];
  resetUserFilters: [];
  toggleUserSelection: [id: number];
  toggleAllFilteredUsers: [];
  openUserDetail: [user: ManagedUserView];
  promoteUser: [user: ManagedUserView];
  disableUser: [user: ManagedUserView];
  enableUser: [user: ManagedUserView];
  deleteUser: [user: ManagedUserView];
  viewUserPassword: [user: ManagedUserView];
  resetUserPassword: [user: ManagedUserView];
  copyUserId: [user: ManagedUserView];
  refreshLogs: [force: boolean];
}>();
</script>

<template>
  <section class="settings-page__panel settings-page__users">
    <template v-if="!userDetailOpen">
      <UserOverviewHeader
        :users-loading="usersLoading"
        :managed-user-stats="managedUserStats"
        @refresh-users="$emit('refreshUsers', $event)"
        @open-panel="$emit('openPanel', $event)"
      />
    </template>
    <template v-else>
      <UserDetailHeader
        :user-detail-tab="userDetailTab"
        @close-user-detail="$emit('closeUserDetail')"
        @update-user-detail-tab="$emit('update:userDetailTab', $event)"
      />
    </template>

    <p v-if="userMessage" class="settings-page__save-message">{{ userMessage }}</p>

    <template v-if="userDetailOpen">
      <div v-if="selectedUserLoading" class="settings-page__logs-empty">加载用户详情中...</div>
      <div v-else-if="selectedUser" class="settings-page__profile">
        <UserProfileInfoTab
          v-if="userDetailTab === 'info'"
          :selected-user="selectedUser"
          :user-action-loading="userActionLoading"
          :user-password-value="userPasswordValue"
          :user-password-confirm-value="userPasswordConfirmValue"
          :user-password-message="userPasswordMessage"
          :user-password-loading="userPasswordLoading"
          :selected-user-activity-logs="selectedUserActivityLogs"
          :current-username="currentUsername"
          :format-log-date="formatLogDate"
          :log-action-text="logActionText"
          :log-target-text="logTargetText"
          :role-text="roleText"
          :status-text="statusText"
          :user-initials="userInitials"
          :can-promote-user="canPromoteUser"
          :can-manage-user="canManageUser"
          @copy-user-id="$emit('copyUserId', $event)"
          @disable-user="$emit('disableUser', $event)"
          @enable-user="$emit('enableUser', $event)"
          @delete-user="$emit('deleteUser', $event)"
          @promote-user="$emit('promoteUser', $event)"
          @reset-user-password="$emit('resetUserPassword', $event)"
          @view-user-password="$emit('viewUserPassword', $event)"
          @open-panel="$emit('openPanel', $event)"
          @update:user-password-value="$emit('update:userPasswordValue', $event)"
          @update:user-password-confirm-value="$emit('update:userPasswordConfirmValue', $event)"
        />
        <UserProfileRolesTab
          v-else-if="userDetailTab === 'roles'"
          :selected-user="selectedUser"
          :user-action-loading="userActionLoading"
          :role-text="roleText"
          :can-promote-user="canPromoteUser"
          :can-manage-user="canManageUser"
          @promote-user="$emit('promoteUser', $event)"
          @disable-user="$emit('disableUser', $event)"
          @enable-user="$emit('enableUser', $event)"
          @delete-user="$emit('deleteUser', $event)"
        />
        <UserProfileLogsTab
          v-else-if="userDetailTab === 'login'"
          mode="login"
          :selected-user="selectedUser"
          :logs="selectedUserLoginLogs"
          :logs-loading="logsLoading"
          :format-log-date="formatLogDate"
          :log-action-text="logActionText"
          :log-target-text="logTargetText"
          @refresh-logs="$emit('refreshLogs', $event)"
        />
        <UserProfileLogsTab
          v-else
          mode="actions"
          :selected-user="selectedUser"
          :logs="selectedUserActionLogs"
          :logs-loading="logsLoading"
          :format-log-date="formatLogDate"
          :log-action-text="logActionText"
          :log-target-text="logTargetText"
          @refresh-logs="$emit('refreshLogs', $event)"
        />
      </div>
      <div v-else class="settings-page__logs-empty">请选择用户</div>
    </template>

    <template v-else>
      <UserListSection
        :users="users"
        :users-loading="usersLoading"
        :user-search="userSearch"
        :user-role-filter="userRoleFilter"
        :user-status-filter="userStatusFilter"
        :selected-user-ids="selectedUserIds"
        :filtered-managed-users="filteredManagedUsers"
        :all-filtered-users-selected="allFilteredUsersSelected"
        :user-action-loading="userActionLoading"
        :format-log-date="formatLogDate"
        :role-text="roleText"
        :status-text="statusText"
        :user-initials="userInitials"
        :can-manage-user="canManageUser"
        @update:user-search="$emit('update:userSearch', $event)"
        @update:user-role-filter="$emit('update:userRoleFilter', $event)"
        @update:user-status-filter="$emit('update:userStatusFilter', $event)"
        @reset-user-filters="$emit('resetUserFilters')"
        @toggle-user-selection="$emit('toggleUserSelection', $event)"
        @toggle-all-filtered-users="$emit('toggleAllFilteredUsers')"
        @open-user-detail="$emit('openUserDetail', $event)"
        @disable-user="$emit('disableUser', $event)"
        @enable-user="$emit('enableUser', $event)"
      />
    </template>
  </section>
</template>
