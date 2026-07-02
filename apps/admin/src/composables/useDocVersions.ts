/**
 * useDocVersions.ts - 文档版本管理 Composable
 *
 * 增强说明：
 * - 从简单 ref 容器升级为完整版本管理
 * - 封装版本列表加载、预览、恢复、副本恢复逻辑
 */
import { ref } from "vue";
import {
  listDocVersionsApi,
  getDocVersionPreviewApi,
  restoreDocVersionApi,
  restoreDocVersionAsCopyApi,
  type DocVersion,
  type DocVersionPreview,
} from "../api/docs";
import { useDocStore } from "../stores/doc";

export interface UseDocVersionsOptions {
  /** 加载完成回调 */
  onLoaded?: (versions: DocVersion[]) => void;
  /** 恢复成功回调 */
  onRestored?: (version: DocVersion) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

export function useDocVersions(options: UseDocVersionsOptions = {}) {
  // 状态
  const versions = ref<DocVersion[]>([]);
  const selectedVersion = ref<DocVersion | null>(null);
  const versionPreview = ref<DocVersionPreview | null>(null);
  const loading = ref(false);
  const previewLoading = ref(false);
  const restoring = ref(false);
  const error = ref<string | null>(null);

  // ============= 加载版本列表 =============
  async function loadVersions(docUid: string): Promise<DocVersion[]> {
    loading.value = true;
    error.value = null;

    try {
      const response = await listDocVersionsApi(docUid);
      versions.value = response.versions;
      options.onLoaded?.(response.versions);
      return response.versions;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e.message;
      options.onError?.(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // ============= 加载版本预览 =============
  async function previewVersion(docUid: string, version: DocVersion): Promise<DocVersionPreview> {
    selectedVersion.value = version;
    previewLoading.value = true;
    error.value = null;

    try {
      const response = await getDocVersionPreviewApi(docUid, version.id);
      versionPreview.value = response.version;
      return response.version;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e.message;
      options.onError?.(e);
      throw e;
    } finally {
      previewLoading.value = false;
    }
  }

  // ============= 恢复版本（原地恢复）=============
  async function restoreVersion(docUid: string, version: DocVersion): Promise<DocVersion> {
    restoring.value = true;
    error.value = null;

    try {
      await restoreDocVersionApi(docUid, version.id);

      // 重新加载文档
      const docsStore = useDocStore();
      await docsStore.loadDoc(docUid);

      // 重新加载版本列表
      await loadVersions(docUid);

      // 清除选择
      clearSelection();

      options.onRestored?.(version);
      return version;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e.message;
      options.onError?.(e);
      throw e;
    } finally {
      restoring.value = false;
    }
  }

  // ============= 恢复为副本 =============
  async function restoreAsCopy(docUid: string, version: DocVersion): Promise<{ docUid: string; title: string }> {
    restoring.value = true;
    error.value = null;

    try {
      const response = await restoreDocVersionAsCopyApi(docUid, version.id);

      // 清除选择
      clearSelection();

      return {
        docUid: response.doc.docUid,
        title: response.doc.title,
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e.message;
      options.onError?.(e);
      throw e;
    } finally {
      restoring.value = false;
    }
  }

  // ============= 清除选择 =============
  function clearSelection(): void {
    selectedVersion.value = null;
    versionPreview.value = null;
  }

  // ============= 重置状态 =============
  function reset(): void {
    versions.value = [];
    selectedVersion.value = null;
    versionPreview.value = null;
    loading.value = false;
    previewLoading.value = false;
    restoring.value = false;
    error.value = null;
  }

  // ============= 辅助方法 =============
  function getVersionById(id: number): DocVersion | undefined {
    return versions.value.find((v) => v.id === id);
  }

  function getLatestVersion(): DocVersion | undefined {
    if (versions.value.length === 0) return undefined;
    return versions.value[0];
  }

  function isCurrentVersion(version: DocVersion): boolean {
    return selectedVersion.value?.id === version.id;
  }

  // ============= 格式化 =============
  function formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  function formatWordCount(count: number): string {
    return `${count} 字`;
  }

  // ============= 导出 =============
  return {
    // 状态
    versions,
    selectedVersion,
    versionPreview,
    loading,
    previewLoading,
    restoring,
    error,

    // 可修改的状态
    versionsRef: versions,
    selectedVersionRef: selectedVersion,
    previewRef: versionPreview,
    errorRef: error,

    // 方法
    loadVersions,
    previewVersion,
    restoreVersion,
    restoreAsCopy,
    clearSelection,
    reset,

    // 辅助方法
    getVersionById,
    getLatestVersion,
    isCurrentVersion,
    formatDate,
    formatWordCount,
  };
}
