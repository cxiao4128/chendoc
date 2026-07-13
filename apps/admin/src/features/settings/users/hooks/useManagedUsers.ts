/**
 * features/settings/users/hooks/useManagedUsers.ts
 * 用户管理主 hooks
 */
import type { Ref } from "vue";
import type { ManagedUserView, OperationLogView } from "../../../../services/api/settings.api";
import { settingsApi } from "../../../../services/api/settings.api";
import { nativeConfirm } from "../../../../services/nativeDialog";
import { createManagedUsersState } from "./managedUsersState";
import { roleText, statusText, userInitials, type AuthContext, type UserDetailTab } from "./managedUsersShared";

export { roleText, statusText, userInitials, type UserDetailTab };

export function useManagedUsers(options: {
  auth: AuthContext;
  operationLogs: Ref<OperationLogView[]>;
  loadOperationLogs: (force?: boolean) => Promise<void>;
}) {
  const state = createManagedUsersState(options.operationLogs);
  const {
    users,
    usersLoading,
    usersLoaded,
    userSearch,
    userRoleFilter,
    userStatusFilter,
    selectedUserIds,
    selectedUser,
    userDetailOpen,
    userDetailTab,
    selectedUserLoading,
    userActionLoading,
    userMessage,
    userPasswordValue,
    userPasswordConfirmValue,
    userPasswordMessage,
    userPasswordLoading,
    filteredManagedUsers,
    allFilteredUsersSelected,
  } = state;

  async function loadUsers(force = false) {
    if (usersLoading.value || (usersLoaded.value && !force)) return;
    usersLoading.value = true;
    userMessage.value = "";
    try {
      users.value = (await settingsApi.users()).users;
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
      selectedUser.value = (await settingsApi.getUser(id)).user;
    } finally {
      selectedUserLoading.value = false;
    }
  }

  function openUserDetail(user: ManagedUserView) {
    userDetailOpen.value = true;
    userDetailTab.value = "info";
    void options.loadOperationLogs();
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
      const response = await settingsApi.promoteUser(user.id);
      userMessage.value = `${user.username} 已提级为管理员`;
      await refreshSelectedUser(response.user);
    } finally {
      userActionLoading.value = null;
    }
  }

  function canPromoteUser(user: ManagedUserView) {
    return options.auth.isSuperAdmin && user.role !== "admin";
  }

  function canManageUser(user: ManagedUserView) {
    if (user.id === options.auth.user?.id) return false;
    if (user.role === "admin" && !options.auth.isSuperAdmin) return false;
    return true;
  }

  async function disableUser(user: ManagedUserView) {
    userActionLoading.value = user.id;
    try {
      const response = await settingsApi.disableUser(user.id);
      userMessage.value = `${user.username} 已禁止登录`;
      await refreshSelectedUser(response.user);
    } finally {
      userActionLoading.value = null;
    }
  }

  async function enableUser(user: ManagedUserView) {
    userActionLoading.value = user.id;
    try {
      const response = await settingsApi.enableUser(user.id);
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
      await settingsApi.deleteUser(user.id);
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
      const response = await settingsApi.getUserPassword(user.id);
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
      const response = await settingsApi.resetUserPassword(user.id, password);
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

  return {
    ...state,
    loadUsers,
    openUserDetail,
    closeUserDetail,
    resetUserFilters,
    toggleUserSelection,
    toggleAllFilteredUsers,
    promoteUser,
    canPromoteUser,
    canManageUser,
    disableUser,
    enableUser,
    deleteUser,
    viewUserPassword,
    resetUserPassword,
    copyUserId,
    roleText,
    statusText,
    userInitials
  };
}
