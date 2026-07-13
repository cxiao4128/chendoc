<script setup lang="ts">
import type { SiteConfigView } from "@/services/api";

defineProps<{
  site: SiteConfigView;
  saving: boolean;
  message: string;
}>();

const emit = defineEmits<{
  submit: [];
  updateField: [field: keyof SiteConfigView, value: string | boolean];
}>();

function inputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value.trim();
}

function checkedValue(event: Event) {
  return (event.target as HTMLInputElement).checked;
}
</script>

<template>
  <form class="settings-page__panel settings-page__appearance" @submit.prevent="$emit('submit')">
    <div class="settings-page__panel-head">
      <div>
        <small>品牌显示</small>
        <h2>品牌资产</h2>
      </div>
      <button class="cd-button primary" type="submit" :disabled="saving">{{ saving ? "保存中" : "保存外观" }}</button>
    </div>
    <label class="cd-label">品牌名<input :value="site.brandName" class="cd-input" @input="emit('updateField', 'brandName', inputValue($event))" /></label>
    <label class="cd-label">短名称<input :value="site.shortName" class="cd-input" @input="emit('updateField', 'shortName', inputValue($event))" /></label>
    <label class="cd-label">远程 Logo URL<input :value="site.logoUrl" class="cd-input" placeholder="https://..." @input="emit('updateField', 'logoUrl', inputValue($event))" /></label>
    <label class="settings-page__toggle">
      <input :checked="site.preferRemoteLogo" type="checkbox" @change="emit('updateField', 'preferRemoteLogo', checkedValue($event))" />
      <span>登录页使用远程 Logo</span>
    </label>
    <label class="cd-label">远程登录壁纸 URL<input :value="site.authWallpaperUrl" class="cd-input" placeholder="https://..." @input="emit('updateField', 'authWallpaperUrl', inputValue($event))" /></label>
    <label class="settings-page__toggle">
      <input :checked="site.preferRemoteWallpaper" type="checkbox" @change="emit('updateField', 'preferRemoteWallpaper', checkedValue($event))" />
      <span>登录页使用远程壁纸</span>
    </label>
    <label class="cd-label">版权信息<input :value="site.copyright" class="cd-input" @input="emit('updateField', 'copyright', inputValue($event))" /></label>
    <label class="cd-label settings-page__wide">
      分享页专属信息
      <textarea
        :value="site.shareFooterText"
        class="cd-textarea settings-page__share-info-input"
        maxlength="180"
        placeholder="更多活动咨询v：cjy90201"
        @input="emit('updateField', 'shareFooterText', inputValue($event))"
      ></textarea>
    </label>
    <div v-if="site.shareFooterText" class="settings-page__share-info-preview settings-page__wide" aria-label="分享页专属信息预览">
      <span>专属信息</span>
      <strong>{{ site.shareFooterText }}</strong>
    </div>
    <p class="settings-page__hint">为空则不展示，会显示在公开分享页正文下方。</p>
    <p v-if="message" class="settings-page__save-message">{{ message }}</p>
  </form>
</template>
