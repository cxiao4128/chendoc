/**
 * features/editor/hooks/useEditorDocument.ts - 编辑器文档操作 Hook
 *
 * 重构说明：
 * - 从 DocEditorPage.vue 抽离文档操作逻辑
 * - 封装文档创建、删除等操作
 */
import { useRouter } from "vue-router";
import { deleteDocApi } from "@/services/api";
import { useDocEditorContext } from "../../../composables/useDocEditorContext";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";

// ============= 导出 Hook =============
export function useEditorDocument() {
  const ctx = useDocEditorContext();
  const router = useRouter();
  const { docsPath, docPath } = useWorkspaceRoutes();

  // ============= 文档操作 =============

  /** 创建新文档 */
  async function createDoc() {
    const doc = await ctx.docs.createDoc("未命名文档");
    router.push(docPath(doc.docUid));
  }

  /** 删除当前文档 */
  async function remove() {
    if (!ctx.current.value) return;
    await deleteDocApi(ctx.current.value.docUid);
    ctx.docs.invalidateDocListCache();
    await ctx.docs.loadList("", { force: true });
    router.push(docsPath.value);
  }

  /** 确认删除回调（供 ConfirmDialog 使用） */
  async function confirmRemove(): Promise<void> {
    await remove();
  }

  return {
    // 方法
    createDoc,
    remove,
    confirmRemove,
  };
}
