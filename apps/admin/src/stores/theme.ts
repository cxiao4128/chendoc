/* ============================================
   ChenDoc - 主题状态管理
   ============================================ */

import { defineStore } from "pinia";
import { ref } from "vue";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "chendoc_theme";

export const useThemeStore = defineStore("theme", () => {
  const theme = ref<Theme>(
    (localStorage.getItem(STORAGE_KEY) as Theme) || "system"
  );

  function applyTheme() {
    const root = document.documentElement;
    if (theme.value === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.setAttribute("data-theme", prefersDark ? "dark" : "light");
    } else {
      root.setAttribute("data-theme", theme.value);
    }
  }

  function setTheme(newTheme: Theme) {
    theme.value = newTheme;
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme();
  }

  function toggleTheme() {
    if (theme.value === "dark") {
      setTheme("light");
    } else {
      setTheme("dark");
    }
  }

  // 初始化
  applyTheme();

  // 监听系统主题变化
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (theme.value === "system") applyTheme();
  });

  return { theme, setTheme, toggleTheme, applyTheme };
});