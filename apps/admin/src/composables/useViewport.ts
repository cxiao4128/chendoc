import { onBeforeUnmount, onMounted, ref } from "vue";

export const MOBILE_VIEWPORT_QUERY = "(max-width: 900px)";

export function useViewport(query = MOBILE_VIEWPORT_QUERY) {
  const matches = ref(false);
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
    mediaQuery.addListener(update);
  });

  onBeforeUnmount(() => {
    if (!mediaQuery) return;
    if ("removeEventListener" in mediaQuery) {
      mediaQuery.removeEventListener("change", update);
      return;
    }
    mediaQuery.removeListener(update);
  });

  return matches;
}

export function useIsMobileViewport() {
  return useViewport();
}
