/**
 * features/settings/site/hooks/useSiteConfig.ts
 * 站点配置 hooks（从 useSystemSettings 迁移）
 */
import { reactive, ref } from "vue";
import { settingsApi } from "../../../../services/api/settings.api";

export function useSiteConfig() {
  const site = reactive({
    brandName: "陈书",
    shortName: "陈书",
    logoUrl: "",
    authWallpaperUrl: "",
    preferRemoteLogo: false,
    preferRemoteWallpaper: false,
    copyright: "2026 陈书",
    recoveryContact: "请联系管理员",
    shareFooterText: ""
  });
  const saving = ref(false);
  const message = ref("");

  async function load() {
    const response = await settingsApi.site();
    Object.assign(site, response.config);
  }

  async function save() {
    saving.value = true;
    message.value = "";
    try {
      const response = await settingsApi.saveSite(site);
      Object.assign(site, response.config);
      message.value = "已保存";
    } finally {
      saving.value = false;
    }
  }

  return { site, saving, message, load, save };
}
