import { reactive, ref, type ShallowRef } from "vue";
import type { Editor } from "@tiptap/vue-3";

interface UseEditorBlockHandleOptions {
  editor: ShallowRef<Editor | null>;
  emitContent: (editor: Editor) => void;
}

export function useEditorBlockHandle(options: UseEditorBlockHandleOptions) {
  const draggedBlock = ref<{ from: number; to: number } | null>(null);
  const blockHandle = reactive({ visible: false, top: 0, left: 0 });

  function currentBlockRange(next = options.editor.value) {
    if (!next) return null;
    const { $from } = next.state.selection;
    if ($from.depth < 1) return null;
    return { from: $from.before(1), to: $from.after(1) };
  }

  function syncBlockHandle(next = options.editor.value) {
    const range = currentBlockRange(next);
    if (!next || !range) {
      blockHandle.visible = false;
      return;
    }
    const coords = next.view.coordsAtPos(range.from);
    blockHandle.visible = true;
    blockHandle.top = Math.max(76, coords.top - 2);
    blockHandle.left = Math.max(8, coords.left - 42);
  }

  function moveDraggedBlock(view: Editor["view"], event: DragEvent) {
    const range = draggedBlock.value;
    if (!range) return false;
    const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
    draggedBlock.value = null;
    if (!target || target.pos >= range.from && target.pos <= range.to) return true;
    event.preventDefault();
    const slice = view.state.doc.slice(range.from, range.to);
    let insertAt = target.pos;
    if (insertAt > range.from) insertAt -= range.to - range.from;
    const tr = view.state.tr.delete(range.from, range.to).insert(insertAt, slice.content);
    view.dispatch(tr.scrollIntoView());
    window.setTimeout(() => {
      if (options.editor.value) options.emitContent(options.editor.value);
    });
    return true;
  }

  function startBlockDrag(event: DragEvent) {
    const range = currentBlockRange();
    if (!range) return;
    draggedBlock.value = range;
    event.dataTransfer?.setData("text/plain", "chendoc-block");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  return { blockHandle, syncBlockHandle, moveDraggedBlock, startBlockDrag };
}
