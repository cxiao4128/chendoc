<script setup lang="ts">
import { Copy, ExternalLink, Plus, Trash2, X } from "lucide-vue-next";

type FormStatus = "draft" | "published" | "closed";
type FormSettingsConfig = {
  allowMultiple: boolean;
  maxSubmissions: number | null;
  privacyNotice: string;
  retentionDays: number | null;
  storeUserAgent: boolean;
};

defineProps<{
  formStatus: FormStatus;
  formUrl: string;
  formId: number | null;
  config: FormSettingsConfig;
  exclusiveInfo: Record<string, string>;
  urlCopied: boolean;
}>();

const emit = defineEmits<{
  updateConfig: [key: keyof FormSettingsConfig, value: string | number | boolean | null];
  updateExclusiveInfoValue: [key: string, value: string];
  toggleFormStatus: [];
  copyFormUrl: [];
  publish: [];
  configChange: [];
  addExclusiveItem: [];
  exclusiveInfoChange: [];
  renameExclusiveItem: [oldKey: string, event: Event];
  removeExclusiveItem: [key: string];
  confirmDelete: [];
}>();

function inputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function updateTextConfig(key: keyof FormSettingsConfig, event: Event) {
  emit("updateConfig", key, inputValue(event));
}

function updateNumberConfig(key: keyof FormSettingsConfig, event: Event) {
  const value = inputValue(event);
  emit("updateConfig", key, value === "" ? null : Number(value));
}

function updateBooleanConfig(key: keyof FormSettingsConfig, event: Event) {
  emit("updateConfig", key, (event.target as HTMLInputElement).checked);
}

function updateExclusiveInfoValue(key: string, event: Event) {
  emit("updateExclusiveInfoValue", key, inputValue(event));
}
</script>

<template>
  <section class="form-body">
    <main class="form-settings-content">
      <div class="form-settings-card">
        <div class="form-settings-row">
          <div class="form-settings-row__info">
            <span class="form-settings-row__label">收集状态</span>
            <span class="form-settings-row__desc">
              {{ formStatus === "draft" ? "发布后填写者才能访问" : formStatus === "closed" ? "当前已停止接收提交" : "公开链接正在接收提交" }}
            </span>
          </div>
          <button v-if="formStatus !== 'draft'" class="form-settings-link" :class="{ 'is-active': formStatus === 'closed' }" type="button" @click="$emit('toggleFormStatus')">
            {{ formStatus === "closed" ? "重新开放" : "暂停收集" }}
          </button>
          <span v-else class="form-settings-state">草稿</span>
        </div>
        <div class="form-settings-row">
          <div class="form-settings-row__info">
            <span class="form-settings-row__label">限制提交份数</span>
            <span class="form-settings-row__desc">达到上限后停止接收新提交</span>
          </div>
          <div class="form-settings-limit-input">
            <input
              :value="config.maxSubmissions ?? ''"
              type="number"
              min="1"
              placeholder="不限"
              aria-label="最多提交份数"
              class="form-settings-input"
              @input="updateNumberConfig('maxSubmissions', $event)"
              @change="$emit('configChange')"
            />
            <span class="form-settings-limit-unit">份</span>
          </div>
        </div>
      </div>

      <div class="form-settings-card">
        <div class="form-settings-row">
          <div class="form-settings-row__info">
            <span class="form-settings-row__label">允许填写人提交多份</span>
          </div>
          <label class="form-switch">
            <input :checked="config.allowMultiple" type="checkbox" @change="updateBooleanConfig('allowMultiple', $event); $emit('configChange')" />
            <span class="form-switch__track"></span>
          </label>
        </div>
        <div class="form-settings-row">
          <div class="form-settings-row__info">
            <span class="form-settings-row__label">保存浏览器信息</span>
            <span class="form-settings-row__desc">默认关闭；开启后仅保存截断到 512 字符的 User-Agent</span>
          </div>
          <label class="form-switch">
            <input :checked="config.storeUserAgent" type="checkbox" @change="updateBooleanConfig('storeUserAgent', $event); $emit('configChange')" />
            <span class="form-switch__track"></span>
          </label>
        </div>
      </div>

      <div class="form-settings-card">
        <div class="form-settings-row">
          <div class="form-settings-row__info">
            <span class="form-settings-row__label">表单链接</span>
            <span class="form-settings-row__desc">{{ formUrl || "发布后可见" }}</span>
          </div>
          <button v-if="formUrl" class="form-settings-link" type="button" @click="$emit('copyFormUrl')">
            {{ urlCopied ? "已复制" : "复制链接" }}
            <Copy :size="14" />
          </button>
          <button v-else-if="formId" class="form-settings-link" type="button" @click="$emit('publish')">
            发布后获取
            <ExternalLink :size="14" />
          </button>
        </div>
      </div>

      <div class="form-settings-card">
        <div class="form-settings-card__header">
          <h3>隐私与保留</h3>
        </div>
        <label class="form-props-panel__section">
          <span class="form-props-panel__label">公开页隐私说明</span>
          <textarea
            :value="config.privacyNotice"
            class="form-props-panel__input"
            rows="3"
            maxlength="500"
            placeholder="说明收集目的和数据使用范围"
            @input="updateTextConfig('privacyNotice', $event)"
            @blur="$emit('configChange')"
          ></textarea>
        </label>
        <label class="form-props-panel__section">
          <span class="form-props-panel__label">数据保留天数</span>
          <input
            :value="config.retentionDays ?? ''"
            class="form-props-panel__input"
            type="number"
            min="1"
            max="3650"
            placeholder="不自动清理"
            aria-label="数据保留天数"
            @input="updateNumberConfig('retentionDays', $event)"
            @change="$emit('configChange')"
          />
        </label>
      </div>

      <div class="form-settings-card">
        <div class="form-settings-card__header">
          <h3>专属信息</h3>
        </div>
        <div class="form-exclusive-info">
          <p class="form-exclusive-info__desc">
            设置提交后展示给填写者的专属信息，如：兑换码、领取链接、VIP时长等。如果不设置，将使用全局的专属信息。
          </p>
          <div class="form-exclusive-list">
            <div v-for="(value, key) in exclusiveInfo" :key="key" class="form-exclusive-item">
              <input
                :value="key"
                type="text"
                class="form-exclusive-item__label"
                maxlength="64"
                aria-label="专属信息名称"
                placeholder="名称"
                @change="$emit('renameExclusiveItem', key as string, $event)"
              />
              <input
                :value="exclusiveInfo[key]"
                type="text"
                class="form-exclusive-item__input"
                maxlength="1000"
                aria-label="专属信息内容"
                placeholder="内容"
                @input="updateExclusiveInfoValue(key as string, $event)"
                @blur="$emit('exclusiveInfoChange')"
              />
              <button class="form-exclusive-item__remove" type="button" aria-label="删除专属信息" @click="$emit('removeExclusiveItem', key as string)">
                <X :size="14" />
              </button>
            </div>
          </div>
          <button class="form-exclusive-add-btn" type="button" @click="$emit('addExclusiveItem')">
            <Plus :size="14" />
            添加专属信息
          </button>
        </div>
      </div>

      <div v-if="formId" class="form-settings-card">
        <div class="form-settings-row">
          <div class="form-settings-row__info">
            <span class="form-settings-row__label">删除表单</span>
            <span class="form-settings-row__desc">删除后无法恢复</span>
          </div>
          <button class="form-settings-danger" type="button" @click="$emit('confirmDelete')">
            <Trash2 :size="14" />
            删除
          </button>
        </div>
      </div>
    </main>
  </section>
</template>
