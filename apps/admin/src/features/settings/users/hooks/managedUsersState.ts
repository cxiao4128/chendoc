/**
 * features/settings/users/hooks/managedUsersState.ts
 * 用户管理状态工厂
 */
import { computed, ref, type Ref } from "vue";
import type { ManagedUserView, OperationLogView } from "../../../../services/api/settings.api";
import { roleText, statusText, type UserDetailTab } from "./managedUsersShared";

export function createManagedUsersState(operationLogs: Ref<OperationLogView[]>) {
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
    const active = users.value.filter((u) => u.status === "active").length;
    const admins = users.value.filter((u) => u.role === "admin").length;
    const disabled = users.value.filter((u) => u.status === "disabled").length;
    const docs = users.value.reduce((sum, u) => sum + u.docCount, 0);
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

  return {
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
    managedUserStats,
    allFilteredUsersSelected,
    selectedUserActivityLogs,
    selectedUserLoginLogs,
    selectedUserActionLogs,
  };
}
