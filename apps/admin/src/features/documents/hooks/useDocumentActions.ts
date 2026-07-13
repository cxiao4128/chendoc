import { useRouter } from "vue-router";
import { createShareApi, getShareByDocApi, updateShareApi } from "@/services/api";
import { useDocStore } from "../../../stores/doc";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";
import { useDocumentBulkActions } from "./useDocumentBulkActions";
import { useDocumentFileActions } from "./useDocumentFileActions";
import { publicUrl } from "../../../config/runtime";

export function useDocumentActions() {
  const router = useRouter();
  const docs = useDocStore();
  const { docPath } = useWorkspaceRoutes();
  const bulk = useDocumentBulkActions({ bulkDeleteDocs: (docUids) => docs.bulkDeleteDocs(docUids) });
  const files = useDocumentFileActions({ docs, router, docPath });

  async function createDoc(title = "未命名文档") {
    const doc = await docs.createDoc(title);
    router.push(docPath(doc.docUid));
  }

  async function createTemplateDoc() {
    const doc = await docs.createDoc("新建模板文档");
    await docs.saveDoc(doc.docUid, {
      contentHtml: "<h2>模板标题</h2><p>在这里写正文。可改成常用方案、说明书、周报或知识卡片。</p>",
      summary: "模板中心创建"
    });
    router.push(docPath(doc.docUid));
  }

  async function togglePinned(doc: { docUid: string; pinned?: boolean }) {
    await docs.saveDoc(doc.docUid, { pinned: !doc.pinned });
  }

  function openOrToggleDoc(docUid: string) {
    if (bulk.bulkMode.value) {
      bulk.toggleDocSelection(docUid);
      return;
    }
    router.push(docPath(docUid));
  }

  function handleRowKeydown(event: Event, docUid: string) {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
    keyboardEvent.preventDefault();
    openOrToggleDoc(docUid);
  }

  async function openShare(doc: {
    docUid: string;
    shareCode?: number | null;
    customSlug?: string | null;
    shareEnabled?: boolean | null;
    shareReviewStatus?: "pending" | "approved" | "rejected" | null;
  }) {
    files.actionMessage.value = "";
    if (doc.shareCode && doc.shareEnabled) {
      window.open(sharePath(doc), "_blank", "noopener,noreferrer");
      return true;
    }
    const pendingWindow = window.open("about:blank", "_blank");
    if (pendingWindow) pendingWindow.opener = null;
    try {
      let share = (await getShareByDocApi(doc.docUid)).share;
      if (!share) share = (await createShareApi(doc.docUid, { isEnabled: true })).share;
      if (!share.isEnabled) {
        await updateShareApi(share.id, { isEnabled: true });
        share = (await getShareByDocApi(doc.docUid)).share;
      }
      docs.invalidateDocListCache();
      doc.shareCode = share?.shareCode ?? null;
      doc.customSlug = share?.customSlug ?? null;
      doc.shareEnabled = share?.isEnabled ?? false;
      doc.shareReviewStatus = share?.reviewStatus ?? null;
      if (!share?.isEnabled) {
        pendingWindow?.close();
        files.actionMessage.value = share?.reviewStatus === "pending"
          ? "分享已提交审核，通过后可公开访问。"
          : "分享尚未公开，请在编辑页检查分享设置。";
        return false;
      }
      if (pendingWindow) pendingWindow.location.href = sharePath(share);
      else window.open(sharePath(share), "_blank", "noopener,noreferrer");
      return true;
    } catch (error) {
      pendingWindow?.close();
      files.actionMessage.value = error instanceof Error ? error.message : "创建分享失败";
      return false;
    }
  }

  function sharePath(doc: { shareCode?: number | null; customSlug?: string | null }): string {
    const key = doc.customSlug || doc.shareCode?.toString() || "";
    return key ? publicUrl(`/r/${key}`) : "";
  }

  return {
    ...bulk,
    ...files,
    createDoc,
    createTemplateDoc,
    togglePinned,
    openOrToggleDoc,
    handleRowKeydown,
    openShare,
    sharePath
  };
}
