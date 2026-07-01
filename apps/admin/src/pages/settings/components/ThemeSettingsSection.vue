<script setup lang="ts">
import { useThemeStore, type Theme } from "../../../stores/theme";

const themeStore = useThemeStore();

const themes: { value: Theme; label: string; description: string }[] = [
  { value: "light", label: "浅色模式", description: "明亮的浅色主题" },
  { value: "dark", label: "深色模式", description: "护眼的深色主题，适合夜间使用" },
  { value: "system", label: "跟随系统", description: "自动跟随设备系统设置" }
];

function selectTheme(theme: Theme) {
  themeStore.setTheme(theme);
}
</script>

<template>
  <section class="settings-page__panel settings-page__theme-section">
    <div class="settings-page__panel-head">
      <div>
        <small>个性化</small>
        <h2>主题设置</h2>
      </div>
    </div>

    <p class="settings-page__theme-description">
      选择您喜欢的界面主题。深色模式可减少眼睛疲劳，适合在光线较暗的环境中使用。
    </p>

    <div class="settings-page__theme-options">
      <button
        v-for="theme in themes"
        :key="theme.value"
        class="settings-page__theme-option"
        :class="{ 'is-active': themeStore.theme === theme.value }"
        type="button"
        @click="selectTheme(theme.value)"
      >
        <div class="settings-page__theme-option__preview" :class="`is-${theme.value}`">
          <div class="settings-page__theme-option__preview-bar"></div>
          <div class="settings-page__theme-option__preview-content">
            <div class="settings-page__theme-option__preview-sidebar"></div>
            <div class="settings-page__theme-option__preview-main">
              <div class="settings-page__theme-option__preview-line"></div>
              <div class="settings-page__theme-option__preview-line settings-page__theme-option__preview-line--short"></div>
            </div>
          </div>
        </div>
        <div class="settings-page__theme-option__info">
          <strong>{{ theme.label }}</strong>
          <span>{{ theme.description }}</span>
        </div>
        <div v-if="themeStore.theme === theme.value" class="settings-page__theme-option__check">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      </button>
    </div>
  </section>
</template>

<style scoped>
.settings-page__theme-section {
  margin-bottom: 24px;
}

.settings-page__theme-description {
  margin: 0 0 20px;
  color: var(--cd-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.settings-page__theme-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 680px) {
  .settings-page__theme-options {
    grid-template-columns: 1fr;
  }
}

.settings-page__theme-option {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 2px solid var(--cd-border);
  border-radius: var(--cd-radius);
  background: var(--cd-bg-plain);
  padding: 16px;
  cursor: pointer;
  transition: border-color 150ms ease-out, box-shadow 150ms ease-out, transform 150ms ease-out;
  text-align: left;
}

.settings-page__theme-option:hover {
  border-color: var(--cd-primary);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.12);
  transform: translateY(-2px);
}

.settings-page__theme-option.is-active {
  border-color: var(--cd-primary);
  background: var(--cd-primary-soft);
}

.settings-page__theme-option__preview {
  position: relative;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
}

.settings-page__theme-option__preview.is-light {
  background: #f5f6f8;
  border: 1px solid #e8eaed;
}

.settings-page__theme-option__preview.is-dark {
  background: #0f1117;
  border: 1px solid #2d3548;
}

.settings-page__theme-option__preview.is-system {
  background: linear-gradient(135deg, #f5f6f8 50%, #0f1117 50%);
  border: 1px solid #d0d5dd;
}

.settings-page__theme-option__preview-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 16px;
  background: rgba(128, 128, 128, 0.3);
}

.settings-page__theme-option__preview-content {
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 4px;
  padding: 0 4px;
}

.settings-page__theme-option__preview-sidebar {
  width: 20px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.2);
}

.settings-page__theme-option__preview-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
}

.settings-page__theme-option__preview-line {
  height: 8px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.25);
}

.settings-page__theme-option__preview-line--short {
  width: 60%;
}

.settings-page__theme-option__info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-page__theme-option__info strong {
  color: var(--cd-ink);
  font-size: 15px;
  font-weight: 600;
}

.settings-page__theme-option__info span {
  color: var(--cd-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.settings-page__theme-option__check {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--cd-primary);
  color: #fff;
}
</style>
