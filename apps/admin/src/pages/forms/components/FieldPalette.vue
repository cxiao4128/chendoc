<script setup lang="ts">
import { Plus, Search, X } from "lucide-vue-next";
import type { FieldCategories, FieldType } from "../../../features/forms";

defineProps<{
  filteredCategories: FieldCategories;
}>();

const searchQuery = defineModel<string>("searchQuery", { required: true });
const mobileFieldPickerOpen = defineModel<boolean>("mobileFieldPickerOpen", { required: true });

defineEmits<{
  addField: [type: FieldType, name?: string];
}>();
</script>

<template>
  <aside class="form-field-panel" :class="{ 'is-mobile-open': mobileFieldPickerOpen }">
    <button class="form-editor-mobile-picker-close" type="button" @click="mobileFieldPickerOpen = false">
      <X :size="16" />关闭题型
    </button>
    <div class="form-field-panel__search">
      <div class="form-field-panel__search-input">
        <Search :size="14" />
        <input v-model="searchQuery" type="text" placeholder="搜索题型" />
      </div>
    </div>

    <div class="form-field-panel__content">
      <template v-for="(category, key) in filteredCategories" :key="key">
        <div v-if="category.items.length > 0" class="form-field-section">
          <h3 class="form-field-section__title">{{ category.title }}</h3>
          <div class="form-field-section__list">
            <button
              v-for="item in category.items"
              :key="item.type"
              class="form-field-card"
              type="button"
              @click="$emit('addField', item.type, item.name)"
            >
              <div class="form-field-card__icon" :class="item.color">
                <component :is="item.icon" :size="16" />
              </div>
              <div class="form-field-card__info">
                <span class="form-field-card__name">
                  {{ item.name }}
                  <span v-if="item.tag" class="form-field-card__tag">{{ item.tag }}</span>
                </span>
                <span class="form-field-card__desc">{{ item.desc }}</span>
              </div>
              <Plus class="form-muted-icon" :size="14" />
            </button>
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>
