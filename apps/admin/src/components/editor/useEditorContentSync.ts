import type { Ref } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { editorTextLength, stringifyContent } from "./editor-content";

type EditorChangePayload = {
  contentJson: string;
  textLength: number;
};

type EditorContentSyncOptions = {
  editor: Ref<Editor | null>;
  emitChange: (payload: EditorChangePayload) => void;
  debouncedCollectToc: (editor: Editor) => void;
};

export function useEditorContentSync(options: EditorContentSyncOptions) {
  let contentEmitTimer: ReturnType<typeof setTimeout> | null = null;

  function currentEditorContent() {
    return options.editor.value ? stringifyContent(options.editor.value.getJSON()) : "";
  }

  function flushContent(next: Editor) {
    options.emitChange({
      contentJson: stringifyContent(next.getJSON()),
      textLength: editorTextLength(next)
    });
    options.debouncedCollectToc(next);
  }

  function emitContent(next: Editor) {
    if (contentEmitTimer) clearTimeout(contentEmitTimer);
    const contentSize = next.state.doc.content.size;
    const delay = contentSize > 1_000_000 ? 1200 : contentSize > 200_000 ? 600 : 250;
    contentEmitTimer = setTimeout(() => {
      contentEmitTimer = null;
      flushContent(next);
    }, delay);
  }

  function flushPendingContent() {
    if (!contentEmitTimer || !options.editor.value) return;
    clearTimeout(contentEmitTimer);
    contentEmitTimer = null;
    flushContent(options.editor.value);
  }

  return {
    currentEditorContent,
    emitContent,
    flushPendingContent
  };
}
