import { computed } from "vue";
import { useRoute } from "vue-router";
import { docPath as buildDocPath, docsPath as buildDocsPath, trashPath as buildTrashPath, workspaceBaseForPath } from "../router/access";

export function useWorkspaceRoutes() {
  const route = useRoute();
  const base = computed(() => workspaceBaseForPath(route.path));
  const docsPath = computed(() => buildDocsPath(base.value));
  const trashPath = computed(() => buildTrashPath(base.value));

  return {
    base,
    docsPath,
    trashPath,
    docPath: (docUid: string) => buildDocPath(base.value, docUid)
  };
}
