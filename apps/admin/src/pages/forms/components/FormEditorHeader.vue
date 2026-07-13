<script setup lang="ts">
import { ArrowLeft, Check, Copy, Save } from "lucide-vue-next";

type FormEditorTab = "edit" | "stats" | "settings";
type FormStatus = "draft" | "published" | "closed";

defineProps<{
  title: string;
  formStatus: FormStatus;
  activeTab: FormEditorTab;
  saveStatusText: string;
  saveState: "idle" | "pending" | "saving" | "saved" | "error";
  saving: boolean;
  formUrl: string;
  copied: boolean;
}>();

defineEmits<{
  back: [];
  save: [];
  copyLink: [];
  switchTab: [tab: FormEditorTab];
  updateTitle: [value: string];
}>();
</script>

<template>
  <header class="form-header">
    <div class="form-header__left">
      <button class="form-header__back" type="button" aria-label="返回收集表列表" @click="$emit('back')">
        <ArrowLeft :size="18" />
      </button>
      <div class="form-header__title-area">
        <input
          :value="title"
          class="form-header__title"
          placeholder="空白收集表"
          @input="$emit('updateTitle', ($event.target as HTMLInputElement).value)"
        />
        <span class="form-header__status" :class="`is-${formStatus}`">
          {{ formStatus === "published" ? "收集中" : formStatus === "closed" ? "已暂停" : "草稿" }}
        </span>
      </div>
    </div>

    <nav class="form-header__tabs">
      <button class="form-tab" :class="{ active: activeTab === 'edit' }" type="button" @click="$emit('switchTab', 'edit')">
        编辑
      </button>
      <button class="form-tab" :class="{ active: activeTab === 'stats' }" type="button" @click="$emit('switchTab', 'stats')">
        统计
      </button>
      <button class="form-tab" :class="{ active: activeTab === 'settings' }" type="button" @click="$emit('switchTab', 'settings')">
        设置
      </button>
    </nav>

    <div class="form-header__right">
      <span v-if="saveStatusText" class="save-status" :class="{ 'is-error': saveState === 'error' }">
        {{ saveStatusText }}
      </span>
      <button class="form-header__action" type="button" :disabled="saving" title="保存表单" aria-label="保存表单" @click="$emit('save')">
        <Save :size="16" />
      </button>
      <button class="form-header__action" type="button" :disabled="!formUrl" :title="copied ? '已复制' : '复制公开链接'" :aria-label="copied ? '已复制' : '复制公开链接'" @click="$emit('copyLink')">
        <component :is="copied ? Check : Copy" :size="16" />
      </button>
    </div>
  </header>
</template>
