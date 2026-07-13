import { computed, reactive, ref } from "vue";
import type { Ref } from "vue";
import type { Editor } from "@tiptap/vue-3";
import type { EditorStylePatch, InsertCommand, TipTapCommandChain } from "./editor-types";

type SlashCommandOptions = {
  editor: Ref<Editor | null>;
  openImagePicker: () => void;
  openVideoPicker: () => void;
  promptForLink: () => Promise<void>;
  applyStylePatch: (patch: EditorStylePatch) => void;
  onOpen?: (editor: Editor) => void;
};

export function useEditorSlashCommands(options: SlashCommandOptions) {
  const slashOpen = ref(false);
  const slashMenu = reactive({ top: 96, left: 16 });
  const slashMenuStyle = computed(() => ({
    top: `${slashMenu.top}px`,
    left: `${slashMenu.left}px`
  }));

  function placeCommandMenu(next = options.editor.value) {
    if (!next) return;
    const coords = next.view.coordsAtPos(next.state.selection.from);
    slashMenu.top = Math.min(window.innerHeight - 280, Math.max(76, coords.bottom + 8));
    slashMenu.left = Math.min(window.innerWidth - 336, Math.max(12, coords.left - 12));
  }

  function openCommandMenu() {
    const next = options.editor.value;
    if (!next) return;
    next.chain().focus().run();
    placeCommandMenu(next);
    options.onOpen?.(next);
    slashOpen.value = true;
  }

  function closeCommandMenu() {
    slashOpen.value = false;
  }

  function textBeforeCursor(next: Editor) {
    const { $from } = next.state.selection;
    return $from.parent.textBetween(0, $from.parentOffset, "\n", "￼");
  }

  function deleteTypedShortcut(next: Editor, shortcut: "/sp" | "/tp") {
    const to = next.state.selection.from;
    next.chain().focus().deleteRange({ from: Math.max(0, to - shortcut.length), to }).run();
  }

  function checkTypedShortcut() {
    const next = options.editor.value;
    if (!next) return;
    const before = textBeforeCursor(next);
    if (before.endsWith("/sp")) {
      deleteTypedShortcut(next, "/sp");
      closeCommandMenu();
      options.openVideoPicker();
      return;
    }
    if (before.endsWith("/tp")) {
      deleteTypedShortcut(next, "/tp");
      closeCommandMenu();
      options.openImagePicker();
      return;
    }
    if (before.endsWith("/")) {
      openCommandMenu();
    }
  }

  function deleteLastSlash() {
    const next = options.editor.value;
    if (!next) return next;
    const pos = next.state.selection.from;
    const before = pos > 0 ? next.state.doc.textBetween(pos - 1, pos) : "";
    if (before === "/") {
      next.chain().focus().deleteRange({ from: pos - 1, to: pos }).run();
    }
    return next;
  }

  function runSlash(command: InsertCommand) {
    const next = deleteLastSlash();
    closeCommandMenu();
    if (!next) return;
    if (command === "paragraph") next.chain().focus().setParagraph().run();
    if (command === "h1") next.chain().focus().toggleHeading({ level: 1 }).run();
    if (command === "h2") next.chain().focus().toggleHeading({ level: 2 }).run();
    if (command === "h3") next.chain().focus().toggleHeading({ level: 3 }).run();
    if (command === "quote") next.chain().focus().toggleBlockquote().run();
    if (command === "code") next.chain().focus().toggleCodeBlock().run();
    if (command === "table") {
      (next.chain().focus() as TipTapCommandChain).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    }
    if (command === "hr") next.chain().focus().setHorizontalRule().run();
    if (command === "bullet") next.chain().focus().toggleBulletList().run();
    if (command === "ordered") next.chain().focus().toggleOrderedList().run();
    if (command === "task") next.chain().focus().toggleTaskList().run();
    if (command === "link") void options.promptForLink();
    if (command === "size15") options.applyStylePatch({ fontSize: "15px" });
    if (command === "size16") options.applyStylePatch({ fontSize: "16px" });
    if (command === "size18") options.applyStylePatch({ fontSize: "18px" });
    if (command === "size20") options.applyStylePatch({ fontSize: "20px" });
    if (command === "image") options.openImagePicker();
    if (command === "video") options.openVideoPicker();
  }

  return {
    slashOpen,
    slashMenuStyle,
    openCommandMenu,
    closeCommandMenu,
    checkTypedShortcut,
    runSlash
  };
}
