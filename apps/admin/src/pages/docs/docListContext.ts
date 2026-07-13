import { inject, provide, type InjectionKey } from "vue";
import type { DocListPageContext } from "../../features/documents/hooks/useDocListPage";

const docListPageKey: InjectionKey<DocListPageContext> = Symbol("doc-list-page");

export function provideDocListContext(context: DocListPageContext) {
  provide(docListPageKey, context);
}

export function useDocListContext() {
  const context = inject(docListPageKey);
  if (!context) throw new Error("DocListPage context missing");
  return context;
}
