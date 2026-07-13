import type { FieldType, FormField } from "../../../services/api/forms.api";
import { generateFormFieldId } from "../form-editor-utils";
import type { FormEditorState } from "./useFormEditorState";

export function createFormEditorFieldActions(state: FormEditorState) {
  function addField(type: FieldType, name?: string) {
    const field: FormField = {
      id: generateFormFieldId(),
      type,
      label: name || `问题${state.fields.value.length + 1}`,
      required: false,
      order: state.fields.value.length,
      ...(type === "select" || type === "radio" || type === "multiselect" ? { options: ["选项1", "选项2"] } : {}),
      ...(type === "number" || type === "age" ? { min: 0, max: 150 } : {}),
      ...(type === "text" || type === "name" || type === "textarea" ? { maxLength: 500 } : {})
    };
    state.fields.value.push(field);
    state.selectedFieldId.value = field.id;
    state.mobileFieldPickerOpen.value = false;
    if (window.matchMedia("(max-width: 900px)").matches) state.mobileEditStep.value = "settings";
    state.saveState.value = "pending";
  }

  function selectField(id: string) {
    state.selectedFieldId.value = id;
    if (window.matchMedia("(max-width: 900px)").matches) state.mobileEditStep.value = "settings";
  }

  function deleteField(id: string) {
    state.fields.value = state.fields.value.filter((field) => field.id !== id);
    if (state.selectedFieldId.value === id) state.selectedFieldId.value = null;
    state.saveState.value = "pending";
  }

  function moveField(fromIndex: number, direction: "up" | "down") {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= state.fields.value.length) return;
    const temp = state.fields.value[fromIndex];
    state.fields.value[fromIndex] = state.fields.value[toIndex];
    state.fields.value[toIndex] = temp;
    state.fields.value.forEach((field, index) => {
      field.order = index;
    });
    state.saveState.value = "pending";
  }

  function onDragStart(index: number) {
    state.draggingIndex.value = index;
  }

  function onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (state.draggingIndex.value === null || state.draggingIndex.value === index) return;
  }

  function onDrop(event: DragEvent, toIndex: number) {
    event.preventDefault();
    if (state.draggingIndex.value === null || state.draggingIndex.value === toIndex) return;
    const fromIndex = state.draggingIndex.value;
    const draggedField = state.fields.value[fromIndex];
    state.fields.value.splice(fromIndex, 1);
    state.fields.value.splice(toIndex, 0, draggedField);
    state.fields.value.forEach((field, index) => {
      field.order = index;
    });
    state.saveState.value = "pending";
    state.draggingIndex.value = null;
  }

  function onDragEnd() {
    state.draggingIndex.value = null;
  }

  function addOption() {
    if (!state.selectedField.value) return;
    const field = state.selectedField.value;
    if (!field.options) field.options = [];
    field.options.push(`选项${field.options.length + 1}`);
    state.saveState.value = "pending";
  }

  function removeOption(index: number) {
    if (!state.selectedField.value?.options) return;
    if (state.selectedField.value.options.length <= 1) {
      state.error.value = "选择题至少保留一个选项";
      return;
    }
    state.selectedField.value.options.splice(index, 1);
    state.saveState.value = "pending";
  }

  return {
    addField,
    selectField,
    deleteField,
    moveField,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    addOption,
    removeOption,
  };
}
