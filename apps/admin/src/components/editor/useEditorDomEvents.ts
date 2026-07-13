import type { Editor } from "@tiptap/vue-3";
import { fileFromPaste } from "./editor-content";

type EditorDomEventsOptions = {
  uploadAndInsertFile: (file: File) => Promise<void>;
  moveDraggedBlock: (view: Editor["view"], event: DragEvent) => boolean;
  checkTypedShortcut: () => void;
  closeCommandMenu: () => void;
  showPreviewImage: (src: string) => void;
};

export function useEditorDomEvents(options: EditorDomEventsOptions) {
  return {
    attributes: {
      class: "chendoc-editor__surface"
    },
    handlePaste(_view: Editor["view"], event: ClipboardEvent) {
      const file = fileFromPaste(event);
      if (!file) return false;
      event.preventDefault();
      void options.uploadAndInsertFile(file);
      return true;
    },
    handleDrop(view: Editor["view"], event: DragEvent) {
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length) {
        event.preventDefault();
        files.forEach((file) => void options.uploadAndInsertFile(file));
        return true;
      }
      return options.moveDraggedBlock(view, event);
    },
    handleTextInput(_view: Editor["view"], _from: number, _to: number, text: string) {
      if (text === "/" || text.toLowerCase() === "p") {
        window.setTimeout(options.checkTypedShortcut);
      }
      return false;
    },
    handleKeyDown(_view: Editor["view"], event: KeyboardEvent) {
      if (event.key === "Escape") options.closeCommandMenu();
      return false;
    },
    handleClick(_view: Editor["view"], _pos: number, event: MouseEvent) {
      const target = event.target as HTMLElement;
      const image = target.closest("img");
      if (image?.getAttribute("src")) {
        options.showPreviewImage(image.getAttribute("src") || "");
        return true;
      }
      const pre = target.closest("pre");
      if (pre?.textContent && navigator.clipboard) {
        void navigator.clipboard.writeText(pre.textContent);
        pre.classList.add("is-copied");
        window.setTimeout(() => pre.classList.remove("is-copied"), 1200);
      }
      return false;
    }
  };
}
