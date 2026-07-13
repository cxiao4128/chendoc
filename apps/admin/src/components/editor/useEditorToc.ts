import type { ShallowRef } from "vue";
import type { Editor } from "@tiptap/vue-3";
import type { TocItem } from "./editor-types";

interface UseEditorTocOptions {
  editor: ShallowRef<Editor | null>;
  docUid: () => string;
  emitToc: (items: TocItem[]) => void;
}

const TOC_DEBOUNCE_MS = 400;

export function useEditorToc(options: UseEditorTocOptions) {
  let tocTimer: ReturnType<typeof setTimeout> | null = null;

  function collectToc(next = options.editor.value) {
    if (!next) return;
    const headings: TocItem[] = [];
    next.view.dom.querySelectorAll("h1, h2, h3").forEach((element, index) => {
      const text = element.textContent?.trim() || "";
      if (!text) return;
      const level = Number(element.tagName.slice(1)) as 1 | 2 | 3;
      const id = element.id || `cd-heading-${options.docUid()}-${index}`;
      element.id = id;
      headings.push({ id, text, level });
    });
    options.emitToc(headings);
  }

  function debouncedCollectToc(next: Editor | null = options.editor.value) {
    if (tocTimer) clearTimeout(tocTimer);
    tocTimer = setTimeout(() => {
      tocTimer = null;
      collectToc(next);
    }, TOC_DEBOUNCE_MS);
  }

  function clearTocTimer() {
    if (!tocTimer) return;
    clearTimeout(tocTimer);
    tocTimer = null;
  }

  return { collectToc, debouncedCollectToc, clearTocTimer };
}
