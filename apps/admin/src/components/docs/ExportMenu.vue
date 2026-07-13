<script setup lang="ts">
// ChenDoc v3.0.0 - 导出菜单组件
import { ref } from "vue";
import { Download, FileText, FileCode, FileJson, Loader2 } from "lucide-vue-next";
import { getExportContentApi, type ExportFormat } from "../../services/api/export.api";

const props = defineProps<{
  docUid: string;
  docTitle: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const loading = ref<ExportFormat | null>(null);
const error = ref("");

const formats: { value: ExportFormat; label: string; icon: any; description: string }[] = [
  { value: "markdown", label: "Markdown", icon: FileText, description: ".md 格式，适合技术文档" },
  { value: "html", label: "HTML", icon: FileCode, description: ".html 格式，保留样式" },
  { value: "json", label: "JSON", icon: FileJson, description: ".json 格式，保留结构" },
];

async function handleExport(format: ExportFormat) {
  loading.value = format;
  error.value = "";

  try {
    const data = await getExportContentApi({
      docUid: props.docUid,
      format,
      includeMetadata: true
    });

    // 创建下载
    const blob = new Blob([data.content], { type: data.contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    emit("close");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "导出失败";
  } finally {
    loading.value = null;
  }
}
</script>

<template>
  <div class="export-menu">
    <header class="export-menu__header">
      <Download :size="16" />
      <span>导出文档</span>
    </header>
    <p class="export-menu__doc-title">{{ docTitle }}</p>

    <div class="export-menu__formats">
      <button
        v-for="fmt in formats"
        :key="fmt.value"
        class="export-menu__format"
        type="button"
        :disabled="loading !== null"
        @click="handleExport(fmt.value)"
      >
        <span class="export-menu__format-icon">
          <Loader2 v-if="loading === fmt.value" :size="18" class="is-spinning" />
          <component v-else :is="fmt.icon" :size="18" />
        </span>
        <span class="export-menu__format-info">
          <strong>{{ fmt.label }}</strong>
          <small>{{ fmt.description }}</small>
        </span>
      </button>
    </div>

    <p v-if="error" class="export-menu__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.export-menu {
  display: grid;
  gap: 12px;
  min-width: 260px;
  padding: 4px 0;
}

.export-menu__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  color: var(--cd-text);
  font-size: 14px;
  font-weight: 700;
}

.export-menu__doc-title {
  margin: 0;
  padding: 0 12px;
  color: var(--cd-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.export-menu__formats {
  display: grid;
  gap: 4px;
  padding: 4px 8px;
}

.export-menu__format {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
  background: var(--cd-panel);
  color: var(--cd-text);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.export-menu__format:hover:not(:disabled) {
  border-color: var(--cd-primary);
  background: var(--cd-primary-soft);
}

.export-menu__format:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.export-menu__format-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--cd-paper-soft);
  color: var(--cd-primary);
  flex-shrink: 0;
}

.export-menu__format-icon .is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.export-menu__format-info {
  display: grid;
  gap: 2px;
}

.export-menu__format-info strong {
  font-size: 13px;
  font-weight: 700;
}

.export-menu__format-info small {
  font-size: 11px;
  color: var(--cd-muted);
}

.export-menu__error {
  margin: 0;
  padding: 8px 12px;
  border-radius: var(--cd-radius);
  background: var(--cd-danger-soft);
  color: var(--cd-danger);
  font-size: 12px;
}
</style>
