<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { Component } from "vue";
import type { Editor } from "@tiptap/vue-3";
import EditorBlockHandle from "./EditorBlockHandle.vue";
import EditorHiddenFileInputs from "./EditorHiddenFileInputs.vue";
import EditorImagePreview from "./EditorImagePreview.vue";
import EditorRuntimeState from "./EditorRuntimeState.vue";
import EditorSlashMenu from "./EditorSlashMenu.vue";
import EditorToolbar from "./EditorToolbar.vue";
import EditorUploadPanel from "./EditorUploadPanel.vue";
import { parseContent, stringifyContent } from "./editor-content";
import { promptForLink } from "./editorLinkPrompt";
import type { TocItem } from "./editor-types";
import { useEditorBlockHandle } from "./useEditorBlockHandle";
import { useEditorContentSync } from "./useEditorContentSync";
import { useEditorDomEvents } from "./useEditorDomEvents";
import { useEditorImageState } from "./useEditorImageState";
import { useEditorRuntimeLoader } from "./useEditorRuntimeLoader";
import { useEditorSlashCommands } from "./useEditorSlashCommands";
import { useEditorStyleState } from "./useEditorStyleState";
import { useEditorToc } from "./useEditorToc";
import { useEditorUploads } from "./useEditorUploads";
import "./chendoc-editor.css";

type EditorHiddenFileInputsHandle = {
  openImage: () => void;
  openVideo: () => void;
  openReplacement: () => void;
  clearVideo: () => void;
};

const props = defineProps<{
  docUid: string;
  contentJson: string;
}>();

const emit = defineEmits<{
  change: [payload: { contentJson: string; textLength: number }];
  toc: [items: TocItem[]];
}>();

const fileInputs = ref<EditorHiddenFileInputsHandle | null>(null);
const editorContentComponent = shallowRef<Component | null>(null);
const editor = shallowRef<Editor | null>(null);
const { editorShellStyle, applyStylePatch } = useEditorStyleState();

const { collectToc, debouncedCollectToc, clearTocTimer } = useEditorToc({
  editor,
  docUid: () => props.docUid,
  emitToc: (items) => emit("toc", items)
});

const { currentEditorContent, emitContent, flushPendingContent } = useEditorContentSync({
  editor,
  emitChange: (payload) => emit("change", payload),
  debouncedCollectToc
});

const { blockHandle, syncBlockHandle, moveDraggedBlock, startBlockDrag } = useEditorBlockHandle({
  editor,
  emitContent
});

const {
  previewImage,
  selectedImage,
  imageCaption,
  syncImageSelection,
  showPreviewImage,
  closePreviewImage,
  updateImageAttrs,
  setImageCenter
} = useEditorImageState({
  editor,
  syncBlockHandle
});

const { slashOpen, slashMenuStyle, openCommandMenu, closeCommandMenu, checkTypedShortcut, runSlash } = useEditorSlashCommands({
  editor,
  openImagePicker,
  openVideoPicker,
  promptForLink: () => promptForLink(editor),
  applyStylePatch,
  onOpen: syncBlockHandle
});

const {
  uploading: pasteUploading,
  failedUpload,
  uploadAndInsertImage,
  uploadAndInsertVideo,
  uploadAndInsertFile,
  retryFailedUpload,
  removeFailedUpload
} = useEditorUploads({
  docUid: () => props.docUid,
  editor,
  insertImage,
  clearVideoInput: () => fileInputs.value?.clearVideo()
});

const editorProps = useEditorDomEvents({
  uploadAndInsertFile,
  moveDraggedBlock,
  checkTypedShortcut,
  closeCommandMenu,
  showPreviewImage
});

const { editorLoading, editorLoadError, loadEditorRuntime, disposeEditorRuntime } = useEditorRuntimeLoader({
  editor,
  editorContentComponent,
  createOptions: () => ({
    content: parseContent(props.contentJson),
    onUpdate: ({ editor: next }: { editor: Editor }) => emitContent(next),
    onSelectionUpdate: ({ editor: next }: { editor: Editor }) => syncImageSelection(next),
    editorProps
  }),
  onReady: () => {
    collectToc();
    syncImageSelection();
  }
});

function flushContentForDocument(event?: Event) {
  const detail = (event as CustomEvent<{ docUid?: string }> | undefined)?.detail;
  if (detail?.docUid && detail.docUid !== props.docUid) return;
  flushPendingContent();
}

watch(() => [props.docUid, props.contentJson] as const, ([nextDocUid, nextContentJson], previous) => {
  const next = editor.value;
  if (!next) return;

  const incomingContent = parseContent(nextContentJson);
  const incomingJson = stringifyContent(incomingContent);
  const editorJson = currentEditorContent();
  const previousDocUid = previous?.[0];
  const previousJson = previous ? stringifyContent(parseContent(previous[1])) : "";
  const isSameDoc = previousDocUid === nextDocUid;

  if (isSameDoc && (editorJson === incomingJson || editorJson !== previousJson)) {
    window.setTimeout(() => {
      collectToc(next);
      syncImageSelection(next);
    });
    return;
  }

  next.commands.setContent(incomingContent, { emitUpdate: false });
  window.setTimeout(() => {
    collectToc(next);
    syncImageSelection(next);
  });
});

onMounted(() => {
  window.addEventListener("chendoc:flush-editor-content", flushContentForDocument as EventListener);
  void loadEditorRuntime();
});

function insertImage(url: string) {
  editor.value?.chain().focus().setImage({ src: url, alt: "" }).run();
}

function openImagePicker() {
  fileInputs.value?.openImage();
}

function onImageFile(file: File) {
  void uploadAndInsertImage(file);
}

function openVideoPicker() {
  fileInputs.value?.openVideo();
}

function onVideoFile(file: File) {
  void uploadAndInsertVideo(file);
}

function replaceFailedUpload() {
  fileInputs.value?.openReplacement();
}

function onReplacementFile(file: File) {
  void uploadAndInsertFile(file);
}

onBeforeUnmount(() => {
  window.removeEventListener("chendoc:flush-editor-content", flushContentForDocument as EventListener);
  flushPendingContent();
  disposeEditorRuntime();
  clearTocTimer();
});
</script>

<template>
  <section class="chendoc-editor" :style="editorShellStyle">
    <EditorBlockHandle
      :visible="blockHandle.visible"
      :top="blockHandle.top"
      :left="blockHandle.left"
      @open="openCommandMenu"
      @dragstart="startBlockDrag"
    />
    <EditorToolbar
      :editor="editor"
      @upload-image="openImagePicker"
      @upload-video="openVideoPicker"
      @style-change="applyStylePatch"
    />
    <EditorHiddenFileInputs
      ref="fileInputs"
      @image="onImageFile"
      @video="onVideoFile"
      @replacement="onReplacementFile"
    />
    <EditorUploadPanel
      v-model:image-caption="imageCaption"
      :uploading="pasteUploading"
      :failed-upload="failedUpload"
      :selected-image="selectedImage"
      @retry="retryFailedUpload"
      @replace="replaceFailedUpload"
      @remove="removeFailedUpload"
      @update-image-attrs="updateImageAttrs"
      @set-image-center="setImageCenter"
    />
    <EditorSlashMenu
      v-if="slashOpen"
      :menu-style="slashMenuStyle"
      @run="runSlash"
    />
    <EditorRuntimeState
      v-if="editorLoadError || editorLoading || !editor || !editorContentComponent"
      :load-error="editorLoadError"
      :loading="editorLoading || !editor || !editorContentComponent"
    />
    <component v-else :is="editorContentComponent" class="chendoc-editor__content" :editor="editor" />
    <EditorImagePreview :src="previewImage" @close="closePreviewImage" />
  </section>
</template>
