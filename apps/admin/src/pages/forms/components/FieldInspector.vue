<script setup lang="ts">
import { computed } from "vue";
import { Edit3, Plus, X } from "lucide-vue-next";
import type { FormField } from "../../../features/forms";

const fields = defineModel<FormField[]>("fields", { required: true });
const selectedFieldId = defineModel<string | null>("selectedFieldId", { required: true });
const mobileEditStep = defineModel<"fields" | "settings" | "preview">("mobileEditStep", { required: true });

defineEmits<{
  addOption: [];
  removeOption: [index: number];
}>();

const selectedField = computed(() => fields.value.find((field) => field.id === selectedFieldId.value) || null);
</script>

<template>
  <aside class="form-props-panel" :class="{ 'is-mobile-open': mobileEditStep === 'settings' }">
    <template v-if="selectedField">
      <div class="form-props-panel__header">
        <h3 class="form-props-panel__title">字段属性</h3>
        <button class="form-props-panel__close" type="button" aria-label="关闭字段设置" @click="selectedFieldId = null">
          <X :size="16" />
        </button>
      </div>
      <div class="form-props-panel__content">
        <div class="form-props-panel__section">
          <label class="form-props-panel__label">{{ selectedField.type === "section" ? "分节标题" : "问题标题" }}</label>
          <input v-model="selectedField.label" type="text" class="form-props-panel__input" />
        </div>

        <div class="form-props-panel__section">
          <label class="form-props-panel__label">{{ selectedField.type === "section" ? "分节说明" : "描述文字" }}</label>
          <input v-model="selectedField.placeholder" type="text" class="form-props-panel__input" placeholder="提示填写者..." />
        </div>

        <div v-if="selectedField.type !== 'section'" class="form-props-panel__section">
          <label class="form-checkbox">
            <input v-model="selectedField.required" type="checkbox" />
            <span class="form-checkbox__box"></span>
            必填
          </label>
        </div>

        <template v-if="selectedField.type === 'radio' || selectedField.type === 'multiselect' || selectedField.type === 'select'">
          <div class="form-props-panel__divider"></div>
          <div class="form-props-panel__section">
            <label class="form-props-panel__label">选项</label>
            <div class="form-options-editor">
              <div v-for="(opt, index) in selectedField.options" :key="index" class="form-option-row">
                <input v-model="selectedField.options![index]" type="text" class="form-props-panel__input" />
                <button class="form-option-row__remove" type="button" :aria-label="`删除选项 ${index + 1}`" @click="$emit('removeOption', index)">
                  <X :size="12" />
                </button>
              </div>
              <button class="form-add-option-btn" type="button" @click="$emit('addOption')">
                <Plus :size="14" /> 添加选项
              </button>
            </div>
          </div>
        </template>

        <template v-if="selectedField.type === 'number' || selectedField.type === 'age'">
          <div class="form-props-panel__divider"></div>
          <div class="form-props-panel__section">
            <label class="form-props-panel__label">数值范围</label>
            <div class="form-range-grid">
              <input v-model.number="selectedField.min" type="number" class="form-props-panel__input" placeholder="最小值" />
              <input v-model.number="selectedField.max" type="number" class="form-props-panel__input" placeholder="最大值" />
            </div>
          </div>
        </template>

        <template v-if="selectedField.type === 'text' || selectedField.type === 'name' || selectedField.type === 'textarea' || selectedField.type === 'phone' || selectedField.type === 'email' || selectedField.type === 'idcard' || selectedField.type === 'address'">
          <div class="form-props-panel__divider"></div>
          <div class="form-props-panel__section">
            <label class="form-props-panel__label">最大字数</label>
            <input v-model.number="selectedField.maxLength" type="number" min="1" max="2000" class="form-props-panel__input" placeholder="不限制" />
          </div>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="form-props-panel__empty">
        <Edit3 :size="32" />
        <p>选择问题以编辑属性</p>
      </div>
    </template>
  </aside>
</template>
