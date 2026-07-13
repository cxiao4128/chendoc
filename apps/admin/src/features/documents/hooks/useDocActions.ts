/**
 * features/documents/hooks/useDocActions.ts
 *
 * 职责：文档 CRUD 操作（创建、保存、删除）
 */
import { useRouter } from "vue-router";
import { useDocStore } from "../../../stores/doc";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";

export function useDocActions() {
  const router = useRouter();
  const docStore = useDocStore();
  const { docPath } = useWorkspaceRoutes();

  // ============= 创建 =============

  /** 创建文档并跳转到编辑器 */
  async function createDoc(title = "未命名文档") {
    const doc = await docStore.createDoc(title);
    router.push(docPath(doc.docUid));
    return doc;
  }

  /** 从模板创建文档 */
  async function createTemplateDoc() {
    const doc = await docStore.createDoc("新建模板文档");
    await docStore.saveDoc(doc.docUid, {
      contentHtml: "<h2>模板标题</h2><p>在这里写正文。可改成常用方案、说明书、周报或知识卡片。</p>",
      summary: "模板中心创建"
    });
    router.push(docPath(doc.docUid));
    return doc;
  }

  // ============= 保存 =============

  /** 保存文档 */
  async function saveDoc(docUid: string, patch: Parameters<typeof docStore.saveDoc>[1]) {
    return await docStore.saveDoc(docUid, patch);
  }

  // ============= 删除 =============

  /** 删除单个文档 */
  async function deleteDoc(docUid: string) {
    return await docStore.saveDoc(docUid, { deletedAt: new Date().toISOString() });
  }

  /** 批量删除文档 */
  async function bulkDeleteDocs(docUids: string[]) {
    return await docStore.bulkDeleteDocs(docUids);
  }

  // ============= 其他操作 =============

  /** 切换置顶状态 */
  async function togglePinned(doc: { docUid: string; pinned?: boolean }) {
    await docStore.saveDoc(doc.docUid, { pinned: !doc.pinned });
  }

  return {
    // 创建
    createDoc,
    createTemplateDoc,

    // 保存
    saveDoc,

    // 删除
    deleteDoc,
    bulkDeleteDocs,

    // 其他
    togglePinned,
  };
}
