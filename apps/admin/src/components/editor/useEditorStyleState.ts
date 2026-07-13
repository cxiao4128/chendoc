import { computed, reactive } from "vue";
import type { EditorStylePatch } from "./editor-types";

export function useEditorStyleState() {
  const editorStyle = reactive({
    fontSize: "16px",
    lineHeight: "1.72",
    paragraphGap: "0.78em"
  });

  const editorShellStyle = computed(() => ({
    "--editor-font-size": editorStyle.fontSize,
    "--editor-line-height": editorStyle.lineHeight,
    "--editor-paragraph-gap": editorStyle.paragraphGap
  }));

  function applyStylePatch(patch: EditorStylePatch) {
    Object.assign(editorStyle, patch);
  }

  return { editorShellStyle, applyStylePatch };
}
