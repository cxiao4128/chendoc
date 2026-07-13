/**
 * features/editor/hooks/useEditorVersions.ts - 编辑器版本管理 Hook
 *
 * 重构说明：
 * - 从 DocEditorPage.vue 抽离版本操作逻辑
 * - 封装版本预览、恢复、复制等操作
 */
import { ref } from "vue";
import { useRouter } from "vue-router";
import {
  getDocVersionPreviewApi,
  listDocVersionsApi,
  restoreDocVersionApi,
  restoreDocVersionAsCopyApi,
  type DocVersion,
  type DocVersionPreview
} from "../../../api/docs";
import { useDocEditorContext } from "../../../composables/useDocEditorContext";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";

// ============= 导出 Hook =============
export function useEditorVersions() {
  const ctx = useDocEditorContext();
  const router = useRouter();
  const { docPath } = useWorkspaceRoutes();

  // ============= 状态 =============

  /** 选中预览的版本 */
  const selectedVersion = ref<DocVersion | null>(null);

  /** 版本预览内容 */
  const versionPreview = ref<DocVersionPreview | null>(null);

  /** 版本预览加载中 */
  const versionPreviewLoading = ref(false);
  let previewSequence = 0;

  function isCurrentDoc(docUid: string) {
    return String(router.currentRoute.value.params.docUid || "") === docUid;
  }

  // ============= 版本操作 =============

  /** 打开版本预览 */
  async function openVersionPreview(version: DocVersion) {
    if (!ctx.current.value) return;
    const targetDocUid = ctx.current.value.docUid;
    const sequence = ++previewSequence;
    selectedVersion.value = version;
    versionPreviewLoading.value = true;
    try {
      const result = await getDocVersionPreviewApi(targetDocUid, version.id);
      if (sequence !== previewSequence || !isCurrentDoc(targetDocUid) || selectedVersion.value?.id !== version.id) return;
      versionPreview.value = result.version;
    } catch {
      // ignore error
    } finally {
      if (sequence === previewSequence && isCurrentDoc(targetDocUid)) {
        versionPreviewLoading.value = false;
      }
    }
  }

  /** 关闭版本预览 */
  function closeVersionPreview() {
    previewSequence += 1;
    selectedVersion.value = null;
    versionPreview.value = null;
    versionPreviewLoading.value = false;
  }

  /** 恢复预览的版本 */
  async function restorePreviewedVersion() {
    if (!selectedVersion.value) return;
    await restoreVersion(selectedVersion.value);
    closeVersionPreview();
  }

  /** 以副本形式恢复版本 */
  async function restorePreviewedVersionAsCopy() {
    if (!ctx.current.value || !selectedVersion.value) return;
    const targetDocUid = ctx.current.value.docUid;
    const targetVersionId = selectedVersion.value.id;
    const restored = await restoreDocVersionAsCopyApi(targetDocUid, targetVersionId);
    if (ctx.current.value?.docUid !== targetDocUid) return;
    router.push(docPath(restored.doc.docUid));
  }

  /** 恢复指定版本 */
  async function restoreVersion(version: DocVersion) {
    if (!ctx.current.value) return;
    if (ctx.dirty.value || ctx.saveState.value === "saving") {
      await ctx.flushPendingSave();
      if (ctx.dirty.value) {
        ctx.saveError.value = ctx.saveError.value || "当前内容还没有保存成功，保存后再恢复历史版本。";
        ctx.saveState.value = "error";
        return;
      }
    }
    const targetDocUid = ctx.current.value.docUid;
    const restored = await restoreDocVersionApi(targetDocUid, version.id);
    if (!isCurrentDoc(targetDocUid)) return;
    const doc = restored.doc;
    if (doc) {
      ctx.docs.current = doc;
      ctx.docs.invalidateDocCache(targetDocUid);
      ctx.docs.invalidateDocListCache();
      ctx.current.value = doc;
      ctx.title.value = doc.title;
      ctx.draft.value = null;
      ctx.dirty.value = false;
      ctx.saveState.value = "saved";
    }
    const response = await listDocVersionsApi(targetDocUid);
    if (!isCurrentDoc(targetDocUid)) return;
    ctx.versions.value = response.versions;
  }

  /** 加载版本列表 */
  async function loadVersions(docUid: string) {
    const response = await listDocVersionsApi(docUid);
    if (ctx.current.value?.docUid !== docUid) return;
    ctx.versions.value = response.versions;
  }

  return {
    // 状态
    selectedVersion,
    versionPreview,
    versionPreviewLoading,

    // 方法
    openVersionPreview,
    closeVersionPreview,
    restorePreviewedVersion,
    restorePreviewedVersionAsCopy,
    restoreVersion,
    loadVersions,
  };
}
