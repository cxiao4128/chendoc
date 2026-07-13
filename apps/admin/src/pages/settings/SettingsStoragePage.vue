<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Save, UploadCloud, Wifi } from "lucide-vue-next";
import { getR2ConfigApi, saveR2ConfigApi, testR2Api, type R2ConfigView } from "@/services/api";
import "./css/settings-storage.css";

const form = reactive<R2ConfigView>({
  accountId: "",
  accessKeyId: "",
  secretAccessKey: "",
  bucket: "",
  publicUrl: "",
  endpoint: "",
  region: "auto"
});
const loading = ref(false);
const message = ref("");
const error = ref("");

function fill(config: R2ConfigView) {
  Object.assign(form, config, {
    accessKeyId: "",
    secretAccessKey: ""
  });
}

async function load() {
  loading.value = true;
  try {
    fill((await getR2ConfigApi()).config);
  } finally {
    loading.value = false;
  }
}

async function save() {
  error.value = "";
  message.value = "";
  try {
    fill((await saveR2ConfigApi(form)).config);
    message.value = "R2 配置已保存，敏感字段已加密入库";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存失败";
  }
}

async function test(upload: boolean) {
  error.value = "";
  message.value = "";
  try {
    await testR2Api(upload);
    message.value = upload ? "连接和测试上传均成功" : "R2 连接成功";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "测试失败";
  }
}

onMounted(load);
</script>

<template>
  <section class="settings-storage-page">
    <div class="settings-storage-page__head">
      <h1>R2 对象存储</h1>
      <p>密钥加密保存。</p>
    </div>
    <form class="settings-storage-page__form cd-card" @submit.prevent="save">
      <label class="cd-label">Account ID<input v-model.trim="form.accountId" class="cd-input" required /></label>
      <label class="cd-label">Bucket<input v-model.trim="form.bucket" class="cd-input" required /></label>
      <label class="cd-label">Public URL<input v-model.trim="form.publicUrl" class="cd-input" required /></label>
      <label class="cd-label">Endpoint<input v-model.trim="form.endpoint" class="cd-input" placeholder="留空时自动使用 accountId.r2.cloudflarestorage.com" /></label>
      <label class="cd-label">Region<input v-model.trim="form.region" class="cd-input" /></label>
      <label class="cd-label">Access Key ID<input v-model.trim="form.accessKeyId" class="cd-input" autocomplete="off" placeholder="留空保留原值" /></label>
      <label class="cd-label settings-storage-page__wide">Secret Access Key<input v-model.trim="form.secretAccessKey" class="cd-input" autocomplete="off" placeholder="留空保留原值" /></label>
      <p v-if="error" class="cd-error settings-storage-page__wide">{{ error }}</p>
      <p v-if="message" class="settings-storage-page__ok settings-storage-page__wide">{{ message }}</p>
      <div class="settings-storage-page__actions settings-storage-page__wide">
        <button class="cd-button primary" type="submit" :disabled="loading"><Save :size="16" />保存</button>
        <button class="cd-button" type="button" @click="test(false)"><Wifi :size="16" />测试连接</button>
        <button class="cd-button" type="button" @click="test(true)"><UploadCloud :size="16" />测试上传</button>
      </div>
    </form>
  </section>
</template>
