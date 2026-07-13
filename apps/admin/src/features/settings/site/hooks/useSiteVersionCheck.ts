/**
 * features/settings/site/hooks/useSiteVersionCheck.ts
 * 站点版本检查 hooks（从 useVersionCheck 迁移）
 */
import { computed, ref, type ComputedRef } from "vue";
import { fetchLatestGitHubVersion } from "../../services/version-check.service";

export type UpdateState = "idle" | "checking" | "latest" | "outdated" | "error";

function canonicalVersion(value: string) {
  const raw = value.trim().toLowerCase().replace(/^v/, "");
  const displayMatch = raw.match(/^1\.(\d{2})$/);
  if (displayMatch) return `1.0.${Number(displayMatch[1])}`;
  const shortSemverMatch = raw.match(/^(\d+)\.(\d+)$/);
  if (shortSemverMatch) return `${shortSemverMatch[1]}.${shortSemverMatch[2]}.0`;
  return raw;
}

export function useSiteVersionCheck(currentVersion: ComputedRef<string>) {
  const updateState = ref<UpdateState>("idle");
  const updateMessage = ref("");

  const versionStatusText = computed(() => {
    if (updateState.value === "checking") return "正在检查 GitHub 版本";
    if (updateState.value === "latest") return updateMessage.value || "当前版本已与 GitHub 保持一致";
    if (updateState.value === "outdated") return updateMessage.value;
    if (updateState.value === "error") return updateMessage.value || "暂时无法检查更新";
    return "可与 GitHub 最新版本进行比对";
  });

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

  return { updateState, updateMessage, versionStatusText, checkUpdate };
}
