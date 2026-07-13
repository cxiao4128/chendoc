import { computed, ref } from "vue";
import type { RouteLocationNormalizedLoaded } from "vue-router";
import { fieldCategories } from "../form-field-categories";
import type { FormEditorStats, FormEditorTab, FormStatus } from "../form-editor.types";
import { isFormEditorTab } from "../form-editor-utils";
import type { FormField } from "../../../services/api/forms.api";

export function createFormEditorState(route: RouteLocationNormalizedLoaded) {
  const isEditing = computed(() => route.params.id !== undefined);
  const formId = computed(() => (route.params.id ? Number(route.params.id) : null));
  const activeTab = ref<FormEditorTab>(isFormEditorTab(route.query.tab) ? route.query.tab : "edit");

  const title = ref("");
  const description = ref("");
  const fields = ref<FormField[]>([]);
  const config = ref({
    allowMultiple: true,
    maxSubmissions: null as number | null,
    privacyNotice: "提交内容仅用于本表单所述用途。",
    retentionDays: 180 as number | null,
    storeUserAgent: false
  });
  const exclusiveInfo = ref<Record<string, string>>({});

  const loading = ref(false);
  const ready = ref(false);
  const skipLeaveGuard = ref(false);
  const saving = ref(false);
  const savedAt = ref("");
  const error = ref("");
  const selectedFieldId = ref<string | null>(null);
  const copied = ref(false);
  const mobileEditStep = ref<"fields" | "settings" | "preview">("fields");
  const mobileFieldPickerOpen = ref(false);

  const formStatus = ref<FormStatus>("draft");
  const urlCopied = ref(false);
  const deleteDialogOpen = ref(false);
  const published = ref(false);
  const formUrl = ref("");
  const saveState = ref<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const draggingIndex = ref<number | null>(null);
  const searchQuery = ref("");
  const statsData = ref<FormEditorStats>({
    submissionCount: 0,
    viewCount: 0,
    ipCount: 0,
    sampleCount: 0,
    fieldStats: []
  });

  const selectedField = computed(() => fields.value.find((field) => field.id === selectedFieldId.value) || null);
  const filteredCategories = computed(() => {
    if (!searchQuery.value.trim()) return fieldCategories;
    const query = searchQuery.value.toLowerCase();
    const filtered: typeof fieldCategories = {
      basic: { title: "搜索结果", items: [] },
      advanced: { title: "", items: [] },
      preset: { title: "", items: [] }
    };
    for (const category of Object.values(fieldCategories)) {
      for (const item of category.items) {
        if (item.name.includes(query) || item.desc.includes(query)) filtered.basic.items.push(item);
      }
    }
    return filtered;
  });

  const saveStatusText = computed(() => {
    if (saving.value || saveState.value === "saving") return "保存中...";
    if (saveState.value === "pending") return "待保存";
    if (saveState.value === "error") return "保存失败";
    if (savedAt.value) return `已保存 ${savedAt.value}`;
    return "";
  });

  return {
    isEditing,
    formId,
    activeTab,
    title,
    description,
    fields,
    config,
    exclusiveInfo,
    loading,
    ready,
    skipLeaveGuard,
    saving,
    savedAt,
    error,
    selectedFieldId,
    selectedField,
    copied,
    mobileEditStep,
    mobileFieldPickerOpen,
    formStatus,
    urlCopied,
    deleteDialogOpen,
    published,
    formUrl,
    saveState,
    draggingIndex,
    searchQuery,
    statsData,
    filteredCategories,
    saveStatusText,
  };
}

export type FormEditorState = ReturnType<typeof createFormEditorState>;
