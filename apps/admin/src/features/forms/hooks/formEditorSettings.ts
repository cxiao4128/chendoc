import { normalizePositiveInteger } from "../form-editor-utils";
import type { FormEditorState } from "./useFormEditorState";

export function createFormEditorSettingsActions(
  state: FormEditorState,
  save: () => Promise<number | null>,
) {
  async function onConfigChange() {
    const rawMaxSubmissions: unknown = state.config.value.maxSubmissions;
    const maxSubmissions = normalizePositiveInteger(rawMaxSubmissions);
    if (rawMaxSubmissions !== "" && rawMaxSubmissions !== null && rawMaxSubmissions !== undefined && maxSubmissions === null) {
      state.error.value = "提交份数必须是正整数";
      return;
    }
    const rawRetentionDays: unknown = state.config.value.retentionDays;
    const retentionDays = normalizePositiveInteger(rawRetentionDays, 3650);
    if (rawRetentionDays !== "" && rawRetentionDays !== null && rawRetentionDays !== undefined && retentionDays === null) {
      state.error.value = "数据保留天数必须是 1 到 3650 的整数";
      return;
    }
    state.config.value.maxSubmissions = maxSubmissions;
    state.config.value.retentionDays = retentionDays;
    state.saveState.value = "pending";
    if (state.formId.value) await save();
  }

  async function onExclusiveInfoChange() {
    state.saveState.value = "pending";
    if (state.formId.value) await save();
  }

  function addExclusiveItem() {
    let index = Object.keys(state.exclusiveInfo.value).length + 1;
    let label = index === 1 ? "说明" : `说明 ${index}`;
    while (label in state.exclusiveInfo.value) {
      index += 1;
      label = `说明 ${index}`;
    }
    state.exclusiveInfo.value[label] = "";
    state.saveState.value = "pending";
  }

  function removeExclusiveItem(key: string) {
    delete state.exclusiveInfo.value[key];
    void onExclusiveInfoChange();
  }

  function renameExclusiveItem(oldKey: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const newKey = input.value.trim();
    if (!newKey || newKey === oldKey) {
      input.value = oldKey;
      return;
    }
    if (newKey in state.exclusiveInfo.value) {
      state.error.value = "专属信息名称不能重复";
      input.value = oldKey;
      return;
    }
    state.exclusiveInfo.value = Object.fromEntries(Object.entries(state.exclusiveInfo.value).map(([key, value]) => [key === oldKey ? newKey : key, value]));
    void onExclusiveInfoChange();
  }

  function updateConfigField(key: keyof typeof state.config.value, value: string | number | boolean | null) {
    (state.config.value as Record<string, string | number | boolean | null>)[key] = value;
    state.saveState.value = "pending";
  }

  function updateExclusiveInfoValue(key: string, value: string) {
    state.exclusiveInfo.value[key] = value;
    state.saveState.value = "pending";
  }

  return {
    onConfigChange,
    onExclusiveInfoChange,
    addExclusiveItem,
    removeExclusiveItem,
    renameExclusiveItem,
    updateConfigField,
    updateExclusiveInfoValue,
  };
}
