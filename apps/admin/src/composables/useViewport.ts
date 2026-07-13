import { onBeforeUnmount, onMounted, ref } from "vue";

export const MOBILE_VIEWPORT_QUERY = "(max-width: 900px)";

export function useViewport(query = MOBILE_VIEWPORT_QUERY) {
  const matches = ref(typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  let mediaQuery: MediaQueryList | null = null;

  const update = () => {
    matches.value = mediaQuery?.matches ?? false;
  };

  onMounted(() => {
    mediaQuery = window.matchMedia(query);
    update();
    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", update);
      return;
    }
    (mediaQuery as MediaQueryList & { addListener(listener: () => void): void }).addListener(update);
  });

  onBeforeUnmount(() => {
    if (!mediaQuery) return;
    if ("removeEventListener" in mediaQuery) {
      mediaQuery.removeEventListener("change", update);
      return;
    }
    (mediaQuery as MediaQueryList & { removeListener(listener: () => void): void }).removeListener(update);
  });

  return matches;
}

export function useIsMobileViewport() {
  return useViewport();
}
