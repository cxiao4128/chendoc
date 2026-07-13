<script setup lang="ts">
import { usePublicForm, type PublicFormCityValue, type PublicFormValue } from "../../features/forms/hooks/usePublicForm";
import PublicFormField from "./components/PublicFormField.vue";
import PublicFormSuccess from "./components/PublicFormSuccess.vue";
import "./css/public-form.css";

const bundledPublicLogoUrl = "/site-assets/chendoc-logo.webp";

const {
  captcha,
  captchaCode,
  cityValues,
  exclusiveEntries,
  fields,
  loadError,
  loading,
  refreshCaptcha,
  submit,
  submitError,
  submittedData,
  submittedEntries,
  submitting,
  values,
  view
} = usePublicForm();

function setValue(fieldId: string, value: PublicFormValue) {
  values[fieldId] = value;
}

function setCityValue(fieldId: string, value: PublicFormCityValue) {
  cityValues[fieldId] = value;
}

function useBundledLogo(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  if (!image.src.endsWith(bundledPublicLogoUrl)) image.src = bundledPublicLogoUrl;
}
</script>

<template>
  <div class="public-form-page">
    <header class="public-form-topbar">
      <a class="public-form-brand" href="/">
        <img :src="view?.site.logoUrl || bundledPublicLogoUrl" alt="" @error="useBundledLogo">
        <span>{{ view?.site.name || "陈书" }}</span>
      </a>
    </header>

    <main class="public-form-main">
      <div v-if="loading" class="public-form-state" role="status">正在加载表单…</div>
      <section v-else-if="loadError" class="public-form-state public-form-state--error">
        <p class="public-form-kicker">收集表</p>
        <h1>表单不可用</h1>
        <p>{{ loadError }}</p>
      </section>

      <template v-else-if="view">
        <header class="public-form-heading">
          <p class="public-form-kicker">收集表</p>
          <h1>{{ view.form.title }}</h1>
          <p v-if="view.form.description" class="public-form-lead">{{ view.form.description }}</p>
        </header>

        <PublicFormSuccess
          v-if="submittedData"
          :exclusive-entries="exclusiveEntries"
          :submitted-entries="submittedEntries"
        />

        <form v-else class="public-form-card" @submit.prevent="submit">
          <PublicFormField
            v-for="field in fields"
            :key="field.id"
            :field="field"
            :model-value="values[field.id]"
            :city-value="cityValues[field.id]"
            @update:model-value="setValue(field.id, $event)"
            @update:city-value="setCityValue(field.id, $event)"
          />

          <p v-if="view.form.privacyNotice || view.form.retentionDays" class="public-form-privacy">
            {{ view.form.privacyNotice || "提交内容仅用于本表单所述用途。" }}
            <template v-if="view.form.retentionDays">数据保留 {{ view.form.retentionDays }} 天，期满后自动清理。</template>
          </p>

          <div v-if="captcha" class="public-form-field public-form-captcha">
            <label for="public-form-captcha">安全验证<span>*</span></label>
            <button type="button" title="换一张验证码" @click="refreshCaptcha">
              <img :src="captcha.image" alt="验证码，点击更换">
            </button>
            <input id="public-form-captcha" v-model.trim="captchaCode" required autocomplete="off" placeholder="请输入计算结果">
          </div>

          <p v-if="submitError" class="public-form-error" role="alert">{{ submitError }}</p>
          <button class="public-form-submit" type="submit" :disabled="submitting">
            {{ submitting ? "提交中…" : "提交" }}
          </button>
        </form>
      </template>
    </main>
  </div>
</template>
