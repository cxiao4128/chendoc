import { markRaw, ref } from "vue";
import type { Component, ShallowRef } from "vue";
import type { Editor } from "@tiptap/vue-3";

type EditorRuntimeLoaderOptions = {
  editor: ShallowRef<Editor | null>;
  editorContentComponent: ShallowRef<Component | null>;
  createOptions: () => Record<string, unknown>;
  onReady: () => void;
};

export function useEditorRuntimeLoader(options: EditorRuntimeLoaderOptions) {
  const editorLoading = ref(true);
  const editorLoadError = ref("");
  let editorLoadToken = 0;

  async function loadEditorRuntime() {
    editorLoading.value = true;
    editorLoadError.value = "";
    const token = ++editorLoadToken;
    try {
      const runtime = await import("./editor-runtime");
      if (token !== editorLoadToken) return;
      options.editorContentComponent.value = markRaw(runtime.EditorContent);
      options.editor.value = markRaw(runtime.createChendocEditor(options.createOptions()));
      window.setTimeout(options.onReady);
    } catch (error) {
      if (token === editorLoadToken) {
        editorLoadError.value = error instanceof Error ? error.message : "编辑器加载失败";
      }
    } finally {
      if (token === editorLoadToken) editorLoading.value = false;
    }
  }

  function disposeEditorRuntime() {
    editorLoadToken += 1;
    options.editor.value?.destroy();
  }

  return {
    editorLoading,
    editorLoadError,
    loadEditorRuntime,
    disposeEditorRuntime
  };
}
