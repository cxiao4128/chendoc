import { ref, type ShallowRef } from "vue";
import type { Editor } from "@tiptap/vue-3";
import type { TipTapCommandChain } from "./editor-types";

type UploadKind = "image" | "video" | "file";

interface FailedUpload {
  file: File;
  kind: UploadKind;
  message: string;
  docUid: string;
}

interface UseEditorUploadsOptions {
  docUid: () => string;
  editor: ShallowRef<Editor | null>;
  insertImage: (url: string) => void;
  clearVideoInput: () => void;
}

async function uploadFile(file: File, docUid: string) {
  const { useUpload } = await import("../../composables/useUpload");
  return useUpload().uploadFile(file, docUid);
}

export function useEditorUploads(options: UseEditorUploadsOptions) {
  const uploading = ref(false);
  const uploadError = ref("");
  const failedUpload = ref<FailedUpload | null>(null);
  let activeUploads = 0;

  function beginUpload() {
    activeUploads += 1;
    uploading.value = true;
  }

  function endUpload() {
    activeUploads = Math.max(0, activeUploads - 1);
    uploading.value = activeUploads > 0;
  }

  function resetUploadState() {
    uploadError.value = "";
    failedUpload.value = null;
  }

  function markFailed(file: File, kind: UploadKind, docUid: string, err: unknown, fallback: string) {
    if (options.docUid() !== docUid) return;
    uploadError.value = err instanceof Error ? err.message : fallback;
    failedUpload.value = { file, kind, docUid, message: uploadError.value };
  }

  async function uploadAndInsertImage(file: File) {
    const targetDocUid = options.docUid();
    const targetEditor = options.editor.value;
    beginUpload();
    resetUploadState();
    try {
      const url = await uploadFile(file, targetDocUid);
      if (options.docUid() !== targetDocUid || options.editor.value !== targetEditor) return;
      options.insertImage(url);
    } catch (err) {
      markFailed(file, "image", targetDocUid, err, "图片上传失败");
    } finally {
      endUpload();
    }
  }

  async function uploadAndInsertVideo(file: File) {
    const targetDocUid = options.docUid();
    const targetEditor = options.editor.value;
    beginUpload();
    resetUploadState();
    try {
      const url = await uploadFile(file, targetDocUid);
      if (options.docUid() !== targetDocUid || options.editor.value !== targetEditor) return;
      (targetEditor?.chain().focus() as TipTapCommandChain)?.setVideo({ src: url, title: file.name }).run();
    } catch (err) {
      markFailed(file, "video", targetDocUid, err, "视频上传失败");
    } finally {
      endUpload();
      options.clearVideoInput();
    }
  }

  async function uploadAndInsertFile(file: File) {
    if (file.type.startsWith("image/")) {
      await uploadAndInsertImage(file);
      return;
    }
    if (file.type.startsWith("video/")) {
      await uploadAndInsertVideo(file);
      return;
    }
    const targetDocUid = options.docUid();
    const targetEditor = options.editor.value;
    beginUpload();
    resetUploadState();
    try {
      const url = await uploadFile(file, targetDocUid);
      if (options.docUid() !== targetDocUid || options.editor.value !== targetEditor) return;
      targetEditor?.chain().focus().insertContent({
        type: "paragraph",
        content: [{
          type: "text",
          text: file.name,
          marks: [{ type: "link", attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } }]
        }]
      }).run();
    } catch (err) {
      markFailed(file, "file", targetDocUid, err, "文件上传失败");
    } finally {
      endUpload();
    }
  }

  function retryFailedUpload() {
    const failed = failedUpload.value;
    if (!failed) return;
    if (failed.docUid !== options.docUid()) {
      removeFailedUpload();
      return;
    }
    if (failed.kind === "image") void uploadAndInsertImage(failed.file);
    else if (failed.kind === "video") void uploadAndInsertVideo(failed.file);
    else void uploadAndInsertFile(failed.file);
  }

  function removeFailedUpload() {
    failedUpload.value = null;
    uploadError.value = "";
  }

  return {
    uploading,
    uploadError,
    failedUpload,
    uploadAndInsertImage,
    uploadAndInsertVideo,
    uploadAndInsertFile,
    retryFailedUpload,
    removeFailedUpload
  };
}
