import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const MIN_KEYBOARD_INSET = 120;
const MAX_UNZOOMED_SCALE_DELTA = 0.05;
const TEXT_INPUT_TYPES = new Set(["", "email", "number", "password", "search", "tel", "text", "url"]);

export function isTextEditingElement(element: Element | null) {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  if (element instanceof HTMLInputElement) {
    return !element.disabled && !element.readOnly && TEXT_INPUT_TYPES.has(element.type);
  }
  return element.isContentEditable
    || Boolean(element.closest('[contenteditable="true"], [contenteditable="plaintext-only"]'));
}

export function useVisualViewportInset() {
  const keyboardInset = ref(0);
  const visibleHeight = ref(0);
  let viewport: VisualViewport | null = null;

  function updateInset() {
    const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
    visibleHeight.value = Math.max(0, Math.round(viewport?.height ?? layoutHeight));
    if (!viewport) {
      keyboardInset.value = 0;
      return;
    }
    const coveredHeight = layoutHeight - viewport.height - viewport.offsetTop;
    const scale = viewport.scale || 1;
    const looksLikeKeyboard = Math.abs(scale - 1) <= MAX_UNZOOMED_SCALE_DELTA
      && isTextEditingElement(document.activeElement)
      && coveredHeight >= MIN_KEYBOARD_INSET;
    keyboardInset.value = looksLikeKeyboard ? Math.max(0, Math.round(coveredHeight)) : 0;
  }

  onMounted(() => {
    viewport = window.visualViewport;
    viewport?.addEventListener("resize", updateInset);
    viewport?.addEventListener("scroll", updateInset);
    window.addEventListener("orientationchange", updateInset);
    document.addEventListener("focusin", updateInset);
    document.addEventListener("focusout", updateInset);
    updateInset();
  });

  onBeforeUnmount(() => {
    viewport?.removeEventListener("resize", updateInset);
    viewport?.removeEventListener("scroll", updateInset);
    window.removeEventListener("orientationchange", updateInset);
    document.removeEventListener("focusin", updateInset);
    document.removeEventListener("focusout", updateInset);
  });

  return {
    keyboardInset,
    visibleHeight,
    keyboardInsetStyle: computed(() => {
      const style: Record<string, string> = {
        "--mobile-keyboard-offset": `${keyboardInset.value}px`
      };
      if (visibleHeight.value > 0) style["--mobile-visible-height"] = `${visibleHeight.value}px`;
      return style;
    })
  };
}
