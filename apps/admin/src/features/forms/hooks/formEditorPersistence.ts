import { toRaw } from "vue";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";
import { formsApi, type FormField } from "../../../services/api/forms.api";
import { calculateFieldStats, isFormEditorTab, optionalFiniteNumber } from "../form-editor-utils";
import type { FormEditorTab } from "../form-editor.types";
import type { FormEditorState } from "./useFormEditorState";
import { publicUrl } from "../../../config/runtime";

function fieldsForSave(state: FormEditorState) {
  return state.fields.value.map((field, index): FormField => {
    const normalized: FormField = {
      ...(JSON.parse(JSON.stringify(toRaw(field))) as FormField),
      label: field.label.trim(),
      order: index
    };
    const min = optionalFiniteNumber(field.min);
    const max = optionalFiniteNumber(field.max);
    const maxLength = optionalFiniteNumber(field.maxLength);
    if (min === undefined) delete normalized.min;
    else normalized.min = min;
    if (max === undefined) delete normalized.max;
    else normalized.max = max;
    if (maxLength === undefined || !Number.isInteger(maxLength)) delete normalized.maxLength;
    else normalized.maxLength = maxLength;
    if (normalized.options) normalized.options = normalized.options.map((option) => option.trim()).filter(Boolean);
    if (normalized.placeholder !== undefined) normalized.placeholder = normalized.placeholder.trim() || undefined;
    return normalized;
  });
}

export function createFormEditorPersistence(
  state: FormEditorState,
  route: RouteLocationNormalizedLoaded,
  router: Router,
) {
  let loadSequence = 0;

  function resetEditorState(options: { ready?: boolean } = {}) {
    state.title.value = "";
    state.description.value = "";
    state.fields.value = [];
    state.config.value = {
      allowMultiple: true,
      maxSubmissions: null,
      privacyNotice: "提交内容仅用于本表单所述用途。",
      retentionDays: 180,
      storeUserAgent: false
    };
    state.exclusiveInfo.value = {};
    state.selectedFieldId.value = null;
    state.formStatus.value = "draft";
    state.formUrl.value = "";
    state.published.value = false;
    state.savedAt.value = "";
    state.error.value = "";
    state.saveState.value = "idle";
    state.statsData.value = {
      submissionCount: 0,
      viewCount: 0,
      ipCount: 0,
      sampleCount: 0,
      fieldStats: []
    };
    state.ready.value = options.ready ?? false;
  }

  function resetForCreate() {
    loadSequence += 1;
    resetEditorState({ ready: true });
    state.loading.value = false;
  }

  async function loadStats(formId = state.formId.value) {
    if (!formId) return;
    const requestedFormId = formId;
    try {
      const [submissionResponse, ipResponse] = await Promise.all([
        formsApi.submissions(requestedFormId, { pageSize: 100 }),
        formsApi.ipStats(requestedFormId)
      ]);
      if (state.formId.value !== requestedFormId) return;
      state.statsData.value = {
        submissionCount: submissionResponse.form.submissionCount,
        viewCount: submissionResponse.form.viewCount,
        ipCount: ipResponse.stats.length,
        sampleCount: submissionResponse.submissions.length,
        fieldStats: calculateFieldStats(submissionResponse.submissions, submissionResponse.form.fields)
      };
    } catch (loadError) {
      console.warn("统计加载失败", loadError);
    }
  }

  async function loadForm() {
    const requestedFormId = state.formId.value;
    if (!requestedFormId) {
      resetForCreate();
      return;
    }
    const sequence = ++loadSequence;
    state.loading.value = true;
    resetEditorState({ ready: false });
    try {
      const response = await formsApi.detail(requestedFormId);
      if (sequence !== loadSequence || state.formId.value !== requestedFormId) return;
      state.title.value = response.form.title;
      state.description.value = response.form.description || "";
      state.fields.value = response.form.fields;
      state.config.value = {
        allowMultiple: response.form.allowMultiple,
        maxSubmissions: response.form.maxSubmissions,
        privacyNotice: response.form.privacyNotice || "",
        retentionDays: response.form.retentionDays,
        storeUserAgent: response.form.storeUserAgent
      };
      state.exclusiveInfo.value = response.form.exclusiveInfo || {};
      state.formStatus.value = response.form.status;
      state.formUrl.value = response.form.status === "published" ? publicUrl(`/f/${response.form.formUid}`) : "";
      state.published.value = response.form.status === "published";
      await loadStats(requestedFormId);
    } catch (loadError) {
      if (sequence !== loadSequence || state.formId.value !== requestedFormId) return;
      state.error.value = loadError instanceof Error ? loadError.message : "加载失败";
    } finally {
      if (sequence === loadSequence && state.formId.value === requestedFormId) {
        state.loading.value = false;
        state.ready.value = true;
      }
    }
  }

  async function save(): Promise<number | null> {
    if (!state.title.value.trim()) {
      state.error.value = "请填写表单标题";
      return null;
    }
    state.saving.value = true;
    state.saveState.value = "saving";
    state.error.value = "";
    try {
      const body = {
        title: state.title.value.trim(),
        description: state.description.value.trim() || undefined,
        fields: fieldsForSave(state),
        config: JSON.parse(JSON.stringify(toRaw(state.config.value))),
        exclusiveInfo: Object.keys(state.exclusiveInfo.value).length > 0 ? state.exclusiveInfo.value : null
      };
      let savedFormId: number;
      if (state.isEditing.value && state.formId.value) {
        savedFormId = state.formId.value;
        await formsApi.update(savedFormId, body);
      } else {
        const response = await formsApi.create(body);
        savedFormId = response.form.id;
        state.skipLeaveGuard.value = true;
        try {
          await router.replace(`/admin/forms/${savedFormId}`);
        } finally {
          state.skipLeaveGuard.value = false;
        }
      }
      state.savedAt.value = new Date().toLocaleTimeString();
      state.saveState.value = "saved";
      return savedFormId;
    } catch (saveError) {
      state.error.value = saveError instanceof Error ? saveError.message : "保存失败";
      state.saveState.value = "error";
      return null;
    } finally {
      state.saving.value = false;
    }
  }

  async function toggleFormStatus() {
    if (!state.formId.value) return;
    if (state.formStatus.value === "draft") {
      state.error.value = "请先发布表单";
      return;
    }
    const action = state.formStatus.value === "closed" ? "publish" : "close";
    try {
      const response = await formsApi.publish(state.formId.value, action);
      state.formStatus.value = response.form.status;
      state.published.value = response.form.status === "published";
      state.formUrl.value = response.form.status === "published" ? publicUrl(`/f/${response.form.formUid}`) : "";
    } catch (statusError) {
      state.error.value = statusError instanceof Error ? statusError.message : "操作失败";
    }
  }

  function copyFormUrl() {
    if (!state.formUrl.value) return;
    navigator.clipboard.writeText(state.formUrl.value).then(() => {
      state.urlCopied.value = true;
      window.setTimeout(() => {
        state.urlCopied.value = false;
      }, 2000);
    });
  }

  function confirmDelete() {
    state.deleteDialogOpen.value = true;
  }

  async function doDeleteForm() {
    if (!state.formId.value) return;
    try {
      await formsApi.delete(state.formId.value);
      state.skipLeaveGuard.value = true;
      router.push("/admin/forms");
    } catch (deleteError) {
      state.error.value = deleteError instanceof Error ? deleteError.message : "删除失败";
    } finally {
      state.deleteDialogOpen.value = false;
    }
  }

  function switchTab(tab: FormEditorTab) {
    state.activeTab.value = tab;
    router.replace({ query: { ...route.query, tab } });
    if (tab === "stats") void loadStats();
  }

  function copyLink() {
    if (!state.formUrl.value) return;
    navigator.clipboard.writeText(state.formUrl.value).then(() => {
      state.copied.value = true;
      window.setTimeout(() => {
        state.copied.value = false;
      }, 2000);
    });
  }

  async function publish() {
    if (!state.fields.value.some((field) => field.type !== "section")) {
      state.error.value = "请先添加至少一个问题";
      return;
    }
    const savedFormId = await save();
    if (!savedFormId || state.error.value) return;
    try {
      const response = await formsApi.publish(savedFormId, "publish");
      state.formUrl.value = publicUrl(`/f/${response.form.formUid}`);
      state.published.value = true;
      state.formStatus.value = "published";
      switchTab("stats");
    } catch (publishError) {
      state.error.value = publishError instanceof Error ? publishError.message : "发布失败";
    }
  }

  function openForm() {
    if (state.formUrl.value) window.open(state.formUrl.value, "_blank");
  }

  function syncRouteTab(tab: unknown) {
    state.activeTab.value = isFormEditorTab(tab) ? tab : "edit";
  }

  return {
    loadStats,
    loadForm,
    resetForCreate,
    save,
    toggleFormStatus,
    copyFormUrl,
    confirmDelete,
    doDeleteForm,
    switchTab,
    copyLink,
    publish,
    openForm,
    syncRouteTab,
  };
}
