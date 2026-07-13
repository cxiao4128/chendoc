<script setup lang="ts">
import { X } from "lucide-vue-next";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { useFormEditor } from "../../features/forms";
import FormEditorEditTab from "./components/FormEditorEditTab.vue";
import FormEditorFooter from "./components/FormEditorFooter.vue";
import FormEditorHeader from "./components/FormEditorHeader.vue";
import FormSettings from "./components/FormSettings.vue";
import FormStats from "./components/FormStats.vue";
import "./css/form-editor.css";

const {
  router,
  isEditing,
  formId,
  activeTab,
  title,
  description,
  fields,
  config,
  exclusiveInfo,
  loading,
  saving,
  error,
  selectedFieldId,
  copied,
  mobileEditStep,
  mobileFieldPickerOpen,
  formStatus,
  urlCopied,
  deleteDialogOpen,
  statsData,
  searchQuery,
  filteredCategories,
  draggingIndex,
  published,
  formUrl,
  saveState,
  saveStatusText,
  onConfigChange,
  onExclusiveInfoChange,
  addExclusiveItem,
  removeExclusiveItem,
  renameExclusiveItem,
  updateConfigField,
  updateExclusiveInfoValue,
  toggleFormStatus,
  copyFormUrl,
  confirmDelete,
  doDeleteForm,
  addField,
  selectField,
  deleteField,
  moveField,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  switchTab,
  copyLink,
  save,
  publish,
  openForm,
  addOption,
  removeOption
} = useFormEditor();
</script>
<template>
  <div class="form-editor">
    <FormEditorHeader
      :title="title"
      :form-status="formStatus"
      :active-tab="activeTab"
      :save-status-text="saveStatusText"
      :save-state="saveState"
      :saving="saving"
      :form-url="formUrl"
      :copied="copied"
      @back="router.push('/admin/forms')"
      @save="save"
      @copy-link="copyLink"
      @switch-tab="switchTab"
      @update-title="title = $event"
    />

    <!-- 错误提示 -->
    <div v-if="error" class="form-error">
      <span>{{ error }}</span>
      <button @click="error = ''"><X :size="14" /></button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="form-loading">
      <div class="form-loading__spinner"></div>
    </div>

    <!-- 主内容区 - 仅编辑页面显示 -->
    <FormEditorEditTab
      v-else-if="activeTab === 'edit'"
      v-model:title="title"
      v-model:description="description"
      v-model:fields="fields"
      v-model:selected-field-id="selectedFieldId"
      v-model:search-query="searchQuery"
      v-model:mobile-edit-step="mobileEditStep"
      v-model:mobile-field-picker-open="mobileFieldPickerOpen"
      :filtered-categories="filteredCategories"
      :dragging-index="draggingIndex"
      @add-field="addField"
      @select-field="selectField"
      @delete-field="deleteField"
      @move-field="moveField"
      @drag-start="onDragStart"
      @drag-over="onDragOver"
      @drop="onDrop"
      @drag-end="onDragEnd"
      @add-option="addOption"
      @remove-option="removeOption"
    />

    <!-- 统计页面 -->
    <FormStats
      v-else-if="activeTab === 'stats'"
      :form-status="formStatus"
      :form-url="formUrl"
      :copied="copied"
      :stats-data="statsData"
      :config="config"
      :fields="fields"
      @copy-link="copyLink"
    />

    <!-- 设置页面 -->
    <FormSettings
      v-else-if="activeTab === 'settings'"
      :form-status="formStatus"
      :form-url="formUrl"
      :form-id="formId"
      :config="config"
      :exclusive-info="exclusiveInfo"
      :url-copied="urlCopied"
      @toggle-form-status="toggleFormStatus"
      @copy-form-url="copyFormUrl"
      @publish="publish"
      @config-change="onConfigChange"
      @update-config="updateConfigField"
      @add-exclusive-item="addExclusiveItem"
      @exclusive-info-change="onExclusiveInfoChange"
      @update-exclusive-info-value="updateExclusiveInfoValue"
      @rename-exclusive-item="renameExclusiveItem"
      @remove-exclusive-item="removeExclusiveItem"
      @confirm-delete="confirmDelete"
    />

    <FormEditorFooter
      v-if="activeTab === 'edit'"
      :is-editing="isEditing"
      :published="published"
      :saving="saving"
      @save="save"
      @open-form="openForm"
      @publish="publish"
    />

    <ConfirmDialog
      v-model="deleteDialogOpen"
      danger
      title="确认删除"
      message="删除后无法恢复，确定要删除这个表单吗？"
      confirm-text="删除"
      @confirm="doDeleteForm"
    />
  </div>
</template>
