<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { KeyRound, Paintbrush, Server, Trash2, ArchiveRestore } from "lucide-vue-next";
import { getSiteConfigApi, saveSiteConfigApi } from "../../api/settings";
import { defaultRemoteLogoUrl, defaultRemoteWallpaperUrl } from "../../config/site-assets";
import { useIsMobileViewport } from "../../composables/useViewport";
import "./settings.css";

const site = reactive({
  brandName: "陈书 / ChensDoc",
  shortName: "陈书",
  logoUrl: defaultRemoteLogoUrl,
  authWallpaperUrl: defaultRemoteWallpaperUrl,
  preferRemoteLogo: false,
  preferRemoteWallpaper: false,
  copyright: "Copyright © 2026 陈书. All rights reserved"
});
const saving = ref(false);
const message = ref("");
const isMobile = useIsMobileViewport();

async function load() {
  const response = await getSiteConfigApi();
  Object.assign(site, response.config);
}

async function save() {
  saving.value = true;
  message.value = "";
  try {
    const response = await saveSiteConfigApi(site);
    Object.assign(site, response.config);
    message.value = "已保存";
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="settings-page" :class="{ 'is-mobile': isMobile }">
    <template v-if="isMobile">
      <div class="settings-page__mobile-hero">
        <span>系统维护</span>
        <h1>后台管理</h1>
        <p>把高频管理入口和站点外观拆成两个清晰区域，手机上也能快速找到关键操作。</p>
      </div>

      <div class="settings-page__mobile-links">
        <RouterLink class="settings-page__mobile-link" to="/admin/invites">
          <KeyRound :size="20" />
          <div><strong>注册卡密</strong><span>生成、禁用、删除一次性卡密</span></div>
        </RouterLink>
        <RouterLink class="settings-page__mobile-link" to="/admin/settings/storage">
          <Server :size="20" />
          <div><strong>R2 设置</strong><span>检查存储连接、密钥与上传测试</span></div>
        </RouterLink>
        <RouterLink class="settings-page__mobile-link" to="/admin/article-delete">
          <Trash2 :size="20" />
          <div><strong>文章删除</strong><span>通过文章 ID 查询并执行软删除</span></div>
        </RouterLink>
        <RouterLink class="settings-page__mobile-link" to="/admin/trash">
          <ArchiveRestore :size="20" />
          <div><strong>回收站</strong><span>恢复删除内容或执行永久清理</span></div>
        </RouterLink>
      </div>

      <form class="settings-page__appearance cd-card is-mobile" @submit.prevent="save">
        <div class="settings-page__section-title">
          <Paintbrush :size="20" />
          <strong>站点外观</strong>
        </div>
        <label class="cd-label">品牌名<input v-model.trim="site.brandName" class="cd-input" /></label>
        <label class="cd-label">短名称<input v-model.trim="site.shortName" class="cd-input" /></label>
        <label class="cd-label">远程 Logo URL<input v-model.trim="site.logoUrl" class="cd-input" placeholder="https://..." /></label>
        <label class="settings-page__toggle">
          <input v-model="site.preferRemoteLogo" type="checkbox" />
          <span>勾选后登录页使用远程 Logo，不勾选则固定走本地秒开</span>
        </label>
        <label class="cd-label">远程登录壁纸 URL<input v-model.trim="site.authWallpaperUrl" class="cd-input" placeholder="https://..." /></label>
        <label class="settings-page__toggle">
          <input v-model="site.preferRemoteWallpaper" type="checkbox" />
          <span>勾选后登录页使用远程壁纸，不勾选则固定走本地镜像壁纸</span>
        </label>
        <label class="cd-label">版权信息<input v-model.trim="site.copyright" class="cd-input" /></label>
        <div class="settings-page__actions is-mobile">
          <span>{{ message }}</span>
          <button class="cd-button primary" type="submit" :disabled="saving">{{ saving ? "保存中" : "保存外观" }}</button>
        </div>
      </form>
    </template>

    <template v-else>
      <div class="settings-page__head">
        <h1>后台管理</h1>
      </div>

      <div class="settings-page__grid">
        <RouterLink class="settings-page__link cd-card" to="/admin/invites">
          <KeyRound :size="21" />
          <div><strong>注册卡密</strong><span>生成、禁用、删除一次性注册卡密</span></div>
        </RouterLink>
        <RouterLink class="settings-page__link cd-card" to="/admin/settings/storage">
          <Server :size="21" />
          <div><strong>R2 设置</strong><span>对象存储连接、密钥加密入库、上传测试</span></div>
        </RouterLink>
        <RouterLink class="settings-page__link cd-card" to="/admin/article-delete">
          <Trash2 :size="21" />
          <div><strong>文章删除</strong><span>输入文章 ID 查询并软删除文章</span></div>
        </RouterLink>
        <RouterLink class="settings-page__link cd-card" to="/admin/trash">
          <ArchiveRestore :size="21" />
          <div><strong>回收站</strong><span>恢复软删除文章，或执行永久删除</span></div>
        </RouterLink>
      </div>

      <form class="settings-page__appearance cd-card" @submit.prevent="save">
        <div class="settings-page__section-title">
          <Paintbrush :size="20" />
          <strong>站点外观</strong>
        </div>
        <label class="cd-label">品牌名<input v-model.trim="site.brandName" class="cd-input" /></label>
        <label class="cd-label">短名称<input v-model.trim="site.shortName" class="cd-input" /></label>
        <label class="cd-label">远程 Logo URL<input v-model.trim="site.logoUrl" class="cd-input" placeholder="https://..." /></label>
        <label class="settings-page__toggle">
          <input v-model="site.preferRemoteLogo" type="checkbox" />
          <span>勾选后登录页使用远程 Logo，不勾选则固定走本地秒开</span>
        </label>
        <label class="cd-label">远程登录壁纸 URL<input v-model.trim="site.authWallpaperUrl" class="cd-input" placeholder="https://..." /></label>
        <label class="settings-page__toggle">
          <input v-model="site.preferRemoteWallpaper" type="checkbox" />
          <span>勾选后登录页使用远程壁纸，不勾选则固定走本地镜像壁纸</span>
        </label>
        <label class="cd-label">版权信息<input v-model.trim="site.copyright" class="cd-input" /></label>
        <div class="settings-page__actions">
          <span>{{ message }}</span>
          <button class="cd-button primary" type="submit" :disabled="saving">{{ saving ? "保存中" : "保存外观" }}</button>
        </div>
      </form>
    </template>
  </section>
</template>
