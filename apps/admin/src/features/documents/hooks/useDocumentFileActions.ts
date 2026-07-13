import { ref } from "vue";
import type { Router } from "vue-router";
import { createSpaceApi } from "@/api/spaces";
import { useUpload } from "../../../composables/useUpload";
import { nativePrompt } from "../../../services/nativeDialog";
import type { useDocStore } from "../../../stores/doc";

export function useDocumentFileActions(options: {
  docs: ReturnType<typeof useDocStore>;
  router: Router;
  docPath: (docUid: string) => string;
}) {
  const uploader = useUpload();
  const uploading = ref(false);
  const actionMessage = ref("");
  const uploadInput = ref<HTMLInputElement | null>(null);

  async function createFolder() {
    const name = await nativePrompt({
      title: "新建空间",
      label: "空间名称",
      value: "新建空间",
      confirmText: "创建空间",
      required: true
    });
    if (!name?.trim()) return;
    const result = await createSpaceApi({ name: name.trim(), description: "从文档工作台创建" });
    actionMessage.value = `空间已创建：${name.trim()} #${result.id}`;
  }

  function triggerUpload() {
    uploadInput.value?.click();
  }

  async function handleUpload(event: Event, onReload?: () => void) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    uploading.value = true;
    actionMessage.value = "";
    try {
      const doc = await options.docs.createDoc(file.name.replace(/\.[^.]+$/, "") || "导入文档");
      const url = await uploader.uploadFile(file, doc.docUid);
      await options.docs.saveDoc(doc.docUid, {
        summary: `上传文件：${file.name}`,
        contentHtml: `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${file.name}</a></p>`
      });
      options.router.push(options.docPath(doc.docUid));
      onReload?.();
    } finally {
      uploading.value = false;
    }
  }

  return { uploading, actionMessage, uploadInput, createFolder, triggerUpload, handleUpload };
}
