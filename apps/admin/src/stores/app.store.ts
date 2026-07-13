import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useAppStore = defineStore("app", () => {
  const busyScopes = ref(new Set<string>());
  const lastError = ref("");

  const isBusy = computed(() => busyScopes.value.size > 0);

  function startBusy(scope = "global") {
    busyScopes.value.add(scope);
  }

  function stopBusy(scope = "global") {
    busyScopes.value.delete(scope);
  }

  function setError(message: string) {
    lastError.value = message;
  }

  function clearError() {
    lastError.value = "";
  }

  return { busyScopes, isBusy, lastError, startBusy, stopBusy, setError, clearError };
});
