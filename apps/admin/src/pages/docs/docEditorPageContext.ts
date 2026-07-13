import { inject, provide, type InjectionKey } from "vue";
import type { DocEditorPageContext } from "../../features/editor/hooks/useDocEditorPage";

const docEditorPageKey: InjectionKey<DocEditorPageContext> = Symbol("doc-editor-page");

export function provideDocEditorPageContext(context: DocEditorPageContext) {
  provide(docEditorPageKey, context);
}

export function useDocEditorPageContext() {
  const context = inject(docEditorPageKey);
  if (!context) throw new Error("DocEditorPage context missing");
  return context;
}
