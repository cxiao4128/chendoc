import { defineStore } from "pinia";
import { ref } from "vue";
import type { R2ConfigView } from "../services/api/settings.api";
import { getR2ConfigApi } from "../services/api/settings.api";

export const useSettingsStore = defineStore("settings", () => {
  const r2Config = ref<R2ConfigView | null>(null);

  async function loadR2Config() {
    const response = await getR2ConfigApi();
    r2Config.value = response.config;
    return response.config;
  }

  return { r2Config, loadR2Config };
});
