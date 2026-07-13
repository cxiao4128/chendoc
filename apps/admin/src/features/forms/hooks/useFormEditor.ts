import { onMounted, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { nativeConfirm } from "../../../services/nativeDialog";
import { createFormEditorFieldActions } from "./formEditorFields";
import { createFormEditorPersistence } from "./formEditorPersistence";
import { createFormEditorSettingsActions } from "./formEditorSettings";
import { createFormEditorState } from "./useFormEditorState";

export function useFormEditor() {
  const router = useRouter();
  const route = useRoute();
  const state = createFormEditorState(route);
  const persistence = createFormEditorPersistence(state, route, router);
  const settings = createFormEditorSettingsActions(state, persistence.save);
  const fields = createFormEditorFieldActions(state);

  watch([state.title, state.description, state.fields, state.config], () => {
    if (state.ready.value && !state.saving.value && state.saveState.value !== "error") state.saveState.value = "pending";
  }, { deep: true });

  watch(() => route.query.tab, (tab) => {
    persistence.syncRouteTab(tab);
  });

  watch(() => state.formId.value, (formId, previousFormId) => {
    if (formId === previousFormId) return;
    if (formId) void persistence.loadForm();
    else persistence.resetForCreate();
  });

  onMounted(() => {
    if (state.isEditing.value) void persistence.loadForm();
    else persistence.resetForCreate();
  });

  onBeforeRouteLeave(async () => {
    if (state.skipLeaveGuard.value || (state.saveState.value !== "pending" && state.saveState.value !== "error")) return true;
    return await nativeConfirm({
      title: "离开表单编辑",
      message: "还有修改未保存，离开后这些修改会丢失。",
      confirmText: "放弃修改",
      danger: true
    });
  });

  return {
    router,
    ...state,
    loadStats: persistence.loadStats,
    onConfigChange: settings.onConfigChange,
    onExclusiveInfoChange: settings.onExclusiveInfoChange,
    addExclusiveItem: settings.addExclusiveItem,
    removeExclusiveItem: settings.removeExclusiveItem,
    renameExclusiveItem: settings.renameExclusiveItem,
    updateConfigField: settings.updateConfigField,
    updateExclusiveInfoValue: settings.updateExclusiveInfoValue,
    toggleFormStatus: persistence.toggleFormStatus,
    copyFormUrl: persistence.copyFormUrl,
    confirmDelete: persistence.confirmDelete,
    doDeleteForm: persistence.doDeleteForm,
    ...fields,
    switchTab: persistence.switchTab,
    copyLink: persistence.copyLink,
    save: persistence.save,
    publish: persistence.publish,
    openForm: persistence.openForm,
  };
}
