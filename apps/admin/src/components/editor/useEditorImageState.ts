import { ref } from "vue";
import type { Ref } from "vue";
import type { Editor } from "@tiptap/vue-3";
import type { TipTapCommandChain } from "./editor-types";

type EditorImageStateOptions = {
  editor: Ref<Editor | null>;
  syncBlockHandle: (editor?: Editor | null) => void;
};

export function useEditorImageState(options: EditorImageStateOptions) {
  const previewImage = ref("");
  const selectedImage = ref(false);
  const imageCaption = ref("");

  function syncImageSelection(next = options.editor.value) {
    if (!next) return;
    selectedImage.value = next.isActive("image");
    const attrs = next.getAttributes("image");
    imageCaption.value = attrs.title || attrs.alt || "";
    options.syncBlockHandle(next);
  }

  function showPreviewImage(src: string) {
    previewImage.value = src;
  }

  function closePreviewImage() {
    previewImage.value = "";
  }

  function updateImageAttrs(patch: Record<string, string | null>) {
    (options.editor.value?.chain().focus() as TipTapCommandChain)?.updateAttributes("image", patch).run();
    syncImageSelection();
  }

  function setImageCenter(centered: boolean) {
    updateImageAttrs({ class: centered ? "cd-image-center" : null });
  }

  return {
    previewImage,
    selectedImage,
    imageCaption,
    syncImageSelection,
    showPreviewImage,
    closePreviewImage,
    updateImageAttrs,
    setImageCenter
  };
}
