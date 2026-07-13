<script setup lang="ts">
import { useIsMobileViewport } from "../../composables/useViewport";
import LogsSettingsSection from "./components/LogsSettingsSection.vue";
import MaintenanceSettingsSection from "./components/MaintenanceSettingsSection.vue";
import RecoverySettingsSection from "./components/RecoverySettingsSection.vue";
import SecuritySettingsSection from "./components/SecuritySettingsSection.vue";
import SiteSettingsSection from "./components/SiteSettingsSection.vue";
import SettingsOverviewPanel from "./components/SettingsOverviewPanel.vue";
import SettingsPageShell from "./components/SettingsPageShell.vue";
import ShareStatusSettingsSection from "./components/ShareStatusSettingsSection.vue";
import StorageSettingsSection from "./components/StorageSettingsSection.vue";
import ThemeSettingsSection from "./components/ThemeSettingsSection.vue";
import UsersSettingsSection from "./components/UsersSettingsSection.vue";
import VersionSettingsSection from "./components/VersionSettingsSection.vue";
import { useSettingsPage } from "./hooks/useSettingsPage";
import "./css/settings.css";

const APP_VERSION = "v3.3.0";
const GITHUB_REPO_URL = "https://github.com/cxiao4128/chendoc";
const isMobile = useIsMobileViewport();
const {
  activePanel, auth, site, saving, message, save, operationLogs, logsLoading,
  recentOperationLogs, loadOperationLogs, logActionText, logTargetText, logActorText,
  formatLogDate, users, usersLoading, userSearch, userRoleFilter, userStatusFilter,
  selectedUserIds, selectedUser, userDetailOpen, userDetailTab, selectedUserLoading,
  userActionLoading, userMessage, userPasswordValue, userPasswordConfirmValue,
  userPasswordMessage, userPasswordLoading, filteredManagedUsers, managedUserStats,
  allFilteredUsersSelected, selectedUserActivityLogs, selectedUserLoginLogs,
  selectedUserActionLogs, loadUsers, openUserDetail, closeUserDetail, resetUserFilters,
  toggleUserSelection, toggleAllFilteredUsers, promoteUser, canPromoteUser, canManageUser,
  disableUser, enableUser, deleteUser, viewUserPassword, resetUserPassword, copyUserId,
  roleText, statusText, userInitials, systemStatus, systemLoading, systemMessage,
  systemActionLoading, storageUsagePercent, securitySummaryText, loadSystemStatus,
  logTrendText, runSystemAction, exportConfig, formatBytes, formatUptime, currentVersion,
  updateState, versionStatusText, checkUpdate, refreshAll, updateSiteField, openPanel
} = useSettingsPage(APP_VERSION);
</script>

<template>
  <SettingsPageShell
    :is-mobile="isMobile"
    :active-panel="activePanel"
    :system-loading="systemLoading"
    @refresh="refreshAll"
    @open-panel="openPanel"
  >
    <SettingsOverviewPanel
      v-if="activePanel === 'overview'"
      :current-version="currentVersion"
      :version-status-text="versionStatusText"
      :system-status="systemStatus"
      :security-summary-text="securitySummaryText"
      :recent-operation-logs="recentOperationLogs"
      :logs-loading="logsLoading"
      :storage-usage-percent="storageUsagePercent"
      :format-uptime="formatUptime"
      :format-bytes="formatBytes"
      :format-log-date="formatLogDate"
      :log-trend-text="logTrendText"
      :log-action-text="logActionText"
      :log-actor-text="logActorText"
      @open-panel="openPanel"
    />

    <LogsSettingsSection
      v-if="activePanel === 'logs'"
      :operation-logs="operationLogs"
      :logs-loading="logsLoading"
      :format-log-date="formatLogDate"
      :log-action-text="logActionText"
      :log-target-text="logTargetText"
      :log-actor-text="logActorText"
      @refresh="loadOperationLogs(true)"
    />

    <SiteSettingsSection
      v-if="activePanel === 'appearance'"
      :site="site"
      :saving="saving"
      :message="message"
      @submit="save"
      @update-field="updateSiteField"
    />

    <ThemeSettingsSection v-if="activePanel === 'appearance'" />

    <RecoverySettingsSection
      v-if="activePanel === 'recovery'"
      :site="site"
      :saving="saving"
      :message="message"
      @submit="save"
      @update-field="updateSiteField"
    />

    <UsersSettingsSection
      v-if="activePanel === 'users'"
      v-model:user-search="userSearch"
      v-model:user-role-filter="userRoleFilter"
      v-model:user-status-filter="userStatusFilter"
      v-model:user-detail-tab="userDetailTab"
      v-model:user-password-value="userPasswordValue"
      v-model:user-password-confirm-value="userPasswordConfirmValue"
      :users="users"
      :users-loading="usersLoading"
      :selected-user-ids="selectedUserIds"
      :selected-user="selectedUser"
      :user-detail-open="userDetailOpen"
      :selected-user-loading="selectedUserLoading"
      :user-action-loading="userActionLoading"
      :user-message="userMessage"
      :user-password-message="userPasswordMessage"
      :user-password-loading="userPasswordLoading"
      :filtered-managed-users="filteredManagedUsers"
      :managed-user-stats="managedUserStats"
      :all-filtered-users-selected="allFilteredUsersSelected"
      :selected-user-activity-logs="selectedUserActivityLogs"
      :selected-user-login-logs="selectedUserLoginLogs"
      :selected-user-action-logs="selectedUserActionLogs"
      :current-username="auth.user?.username || ''"
      :logs-loading="logsLoading"
      :format-log-date="formatLogDate"
      :log-action-text="logActionText"
      :log-target-text="logTargetText"
      :role-text="roleText"
      :status-text="statusText"
      :user-initials="userInitials"
      :can-promote-user="canPromoteUser"
      :can-manage-user="canManageUser"
      @refresh-users="loadUsers"
      @open-panel="openPanel"
      @close-user-detail="closeUserDetail"
      @reset-user-filters="resetUserFilters"
      @toggle-user-selection="toggleUserSelection"
      @toggle-all-filtered-users="toggleAllFilteredUsers"
      @open-user-detail="openUserDetail"
      @promote-user="promoteUser"
      @disable-user="disableUser"
      @enable-user="enableUser"
      @delete-user="deleteUser"
      @view-user-password="viewUserPassword"
      @reset-user-password="resetUserPassword"
      @copy-user-id="copyUserId"
      @refresh-logs="loadOperationLogs"
    />

    <SecuritySettingsSection
      v-if="activePanel === 'security'"
      :system-status="systemStatus"
      :system-loading="systemLoading"
      :system-action-loading="systemActionLoading"
      :system-message="systemMessage"
      @refresh="loadSystemStatus"
      @run-action="runSystemAction"
    />

    <ShareStatusSettingsSection v-if="activePanel === 'shares'" :system-status="systemStatus" />
    <StorageSettingsSection v-if="activePanel === 'storage'" :system-status="systemStatus" :format-bytes="formatBytes" />

    <MaintenanceSettingsSection
      v-if="activePanel === 'maintenance'"
      :system-status="systemStatus"
      :system-action-loading="systemActionLoading"
      :system-message="systemMessage"
      :format-log-date="formatLogDate"
      :format-bytes="formatBytes"
      @run-action="runSystemAction"
      @export-config="exportConfig"
    />

    <VersionSettingsSection
      v-if="activePanel === 'version'"
      :current-version="currentVersion"
      :version-status-text="versionStatusText"
      :update-state="updateState"
      :repo-url="GITHUB_REPO_URL"
      @check-update="checkUpdate"
    />

    <p v-if="systemMessage && activePanel !== 'security' && activePanel !== 'maintenance'" class="settings-page__save-message settings-page__global-message">{{ systemMessage }}</p>
  </SettingsPageShell>
</template>
