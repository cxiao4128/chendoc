import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { WorkspaceScope } from "../types/route";

export const useRouteStore = defineStore("route", () => {
  const scope = ref<WorkspaceScope>("users");
  const lastVisitedPath = ref("");

  const isAdminScope = computed(() => scope.value === "admin");

  function setScope(next: WorkspaceScope) {
    scope.value = next;
  }

  function rememberPath(path: string) {
    lastVisitedPath.value = path;
  }

  return { scope, isAdminScope, lastVisitedPath, setScope, rememberPath };
});
