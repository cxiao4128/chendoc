import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDocEditorContext } from "../../../composables/useDocEditorContext";
import { useIsMobileViewport } from "../../../composables/useViewport";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";
import {
  useEditorDocument,
  useEditorSchedule,
  useEditorShare,
  useEditorVersions,
} from "../../editor";

export function useDocEditorPage() {
  const ctx = useDocEditorContext();
  const route = useRoute();
  const router = useRouter();
  const isMobile = useIsMobileViewport();
  const { docsPath, docPath } = useWorkspaceRoutes();

  const editorKeyCounter = ref(0);
  const editorKey = computed(() => String(editorKeyCounter.value));

  const sharePanelOpen = ref(false);
  const commentPanelOpen = ref(false);
  const exportMenuOpen = ref(false);
  const deleteOpen = ref(false);
  const copied = ref(false);

  const versions = useEditorVersions();
  const documentActions = useEditorDocument();
  const shareActions = useEditorShare({ panelOpen: sharePanelOpen, copied });
  const schedule = useEditorSchedule(ctx.current);
  watch(() => route.params.docUid, () => {
    editorKeyCounter.value++;
    versions.closeVersionPreview();
    schedule.resetScheduleState();
    sharePanelOpen.value = false;
    commentPanelOpen.value = false;
    exportMenuOpen.value = false;
    deleteOpen.value = false;
    copied.value = false;
  });
  const docUid = computed(() => String(route.params.docUid || ""));
  const editorContentJson = computed(() => (
    ctx.draft.value?.contentJson
    ?? ctx.current.value?.contentJson
    ?? ""
  ));

  return reactive({
    ctx,
    route,
    router,
    isMobile,
    docsPath,
    docPath,
    docUid,
    editorKey,
    editorContentJson,
    sharePanelOpen,
    commentPanelOpen,
    exportMenuOpen,
    deleteOpen,
    copied,
    current: ctx.current,
    loading: ctx.loading,
    error: ctx.error,
    title: ctx.title,
    saveState: ctx.saveState,
    saveError: ctx.saveError,
    documentWordCount: ctx.documentWordCount,
    share: ctx.share,
    shareLoading: ctx.shareLoading,
    shareEnabled: ctx.shareEnabled,
    sharePassword: ctx.sharePassword,
    shareCodeInput: ctx.shareCodeInput,
    customSlugInput: ctx.customSlugInput,
    shareHasPassword: ctx.shareHasPassword,
    toc: ctx.toc,
    showDesktopLeft: ctx.showDesktopLeft,
    showDesktopDocTree: ctx.showDesktopDocTree,
    onEditorChange: (payload: { contentJson: string; textLength: number }) => ctx.onEditorChange(payload),
    retryLoadDetail: () => ctx.retryLoadDetail(),
    flushPendingSave: () => ctx.flushPendingSave(),
    retrySave: () => ctx.retrySave(),
    ...versions,
    ...documentActions,
    ...shareActions,
    ...schedule,
  });
}

export type DocEditorPageContext = ReturnType<typeof useDocEditorPage>;
