import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useManagedUsers } from "../../../features/settings/hooks/useManagedUsers";
import { useOperationLogs } from "../../../features/settings/hooks/useOperationLogs";
import { useSystemMaintenance } from "../../../features/settings/hooks/useSystemMaintenance";
import { useSystemSettings } from "../../../features/settings/hooks/useSystemSettings";
import { useVersionCheck } from "../../../features/settings/hooks/useVersionCheck";
import { useAuthStore } from "../../../stores/auth";
import type { SettingsPanel } from "../settings.types";

export function useSettingsPage(appVersion: string) {
  const auth = useAuthStore();
  const activePanel = ref<SettingsPanel>("overview");
  let systemRefreshTimer: number | undefined;

  const { site, saving, message, load: loadSiteConfig, save } = useSystemSettings();
  const logs = useOperationLogs();
  const users = useManagedUsers({ auth, operationLogs: logs.operationLogs, loadOperationLogs: logs.loadOperationLogs });
  const system = useSystemMaintenance({ afterMutating: () => logs.loadOperationLogs(true) });
  const currentVersion = computed(() => system.systemStatus.value?.version || appVersion);
  const version = useVersionCheck(currentVersion);

  async function refreshAll() {
    await Promise.all([loadSiteConfig(), system.loadSystemStatus()]);
  }

  function updateSiteField(field: string, value: string | boolean) {
    switch (field) {
      case "brandName":
        site.brandName = String(value);
        break;
      case "shortName":
        site.shortName = String(value);
        break;
      case "logoUrl":
        site.logoUrl = String(value);
        break;
      case "authWallpaperUrl":
        site.authWallpaperUrl = String(value);
        break;
      case "copyright":
        site.copyright = String(value);
        break;
      case "recoveryContact":
        site.recoveryContact = String(value);
        break;
      case "shareFooterText":
        site.shareFooterText = String(value);
        break;
      case "preferRemoteLogo":
        site.preferRemoteLogo = Boolean(value);
        break;
      case "preferRemoteWallpaper":
        site.preferRemoteWallpaper = Boolean(value);
        break;
    }
  }

  function openPanel(panel: SettingsPanel) {
    activePanel.value = panel;
    if (activePanel.value === "logs") void logs.loadOperationLogs();
    if (activePanel.value === "users") void users.loadUsers();
    if (["security", "shares", "storage", "maintenance"].includes(activePanel.value)) void system.loadSystemStatus();
  }

  onMounted(() => {
    void refreshAll();
    void logs.loadOperationLogs();
    systemRefreshTimer = window.setInterval(() => {
      void system.loadSystemStatus();
    }, 30_000);
  });

  onBeforeUnmount(() => {
    if (systemRefreshTimer) window.clearInterval(systemRefreshTimer);
  });

  return {
    auth,
    activePanel,
    site,
    saving,
    message,
    save,
    currentVersion,
    ...logs,
    ...users,
    ...system,
    ...version,
    refreshAll,
    updateSiteField,
    openPanel
  };
}
