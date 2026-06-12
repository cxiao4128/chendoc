<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import type { Component } from "vue";
import type { Editor } from "@tiptap/vue-3";
import EditorToolbar from "./EditorToolbar.vue";
import { nativePrompt } from "../../services/nativeDialog";
import "./chendoc-editor.css";

interface TocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

interface EditorStylePatch {
  fontSize?: string;
  lineHeight?: string;
  paragraphGap?: string;
}

type InsertCommand =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "image"
  | "video"
  | "quote"
  | "code"
  | "table"
  | "hr"
  | "bullet"
  | "ordered"
  | "task"
  | "link"
  | "size15"
  | "size16"
  | "size18"
  | "size20";

const props = defineProps<{
  docId: number;
  contentJson: string;
}>();

const emit = defineEmits<{
  change: [payload: { contentJson: string; contentHtml: string }];
  toc: [items: TocItem[]];
}>();

const slashOpen = ref(false);
const editorLoading = ref(true);
const editorLoadError = ref("");
const pasteUploading = ref(false);
const uploadError = ref("");
const previewImage = ref("");
const imageInput = ref<HTMLInputElement | null>(null);
const videoInput = ref<HTMLInputElement | null>(null);
const selectedImage = ref(false);
const imageWidth = ref("");
const imageCaption = ref("");
const draggedBlock = ref<{ from: number; to: number } | null>(null);
const blockHandle = reactive({ visible: false, top: 0, left: 0 });
const slashMenu = reactive({ top: 96, left: 16 });
const editorStyle = reactive({
  fontSize: "16px",
  lineHeight: "1.72",
  paragraphGap: "0.78em"
});

const editorShellStyle = computed(() => ({
  "--editor-font-size": editorStyle.fontSize,
  "--editor-line-height": editorStyle.lineHeight,
  "--editor-paragraph-gap": editorStyle.paragraphGap
}));
const slashMenuStyle = computed(() => ({
  top: `${slashMenu.top}px`,
  left: `${slashMenu.left}px`
}));

const editorContentComponent = shallowRef<Component | null>(null);
const editor = shallowRef<Editor | null>(null);
let editorLoadToken = 0;

async function uploadFile(file: File, docId?: number | null) {
  const { useUpload } = await import("../../composables/useUpload");
  return useUpload().uploadFile(file, docId);
}

function parseContent(value: string) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
}

function stringifyContent(value: unknown) {
  return JSON.stringify(value);
}

function currentEditorContent() {
  return editor.value ? stringifyContent(editor.value.getJSON()) : "";
}

function fileFromPaste(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items || []);
  for (const item of items) {
    if (item.kind === "file" && (item.type.startsWith("image/") || item.type.startsWith("video/"))) {
      return item.getAsFile();
    }
  }

  const html = event.clipboardData?.getData("text/html") || "";
  const dataUrl = html.match(/<img[^>]+src=["'](data:image\/[^"']+)["']/i)?.[1];
  if (dataUrl) return fileFromDataUrl(dataUrl);

  return null;
}

function fileFromDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) return null;
  const mimeType = match[1];
  const payload = match[3];
  const binary = match[2] ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "png";
  return new File([bytes], `pasted-image-${Date.now()}.${extension}`, { type: mimeType });
}

function emitContent(next: Editor) {
  emit("change", {
    contentJson: JSON.stringify(next.getJSON()),
    contentHtml: next.getHTML()
  });
  collectToc(next);
}

function collectToc(next = editor.value) {
  if (!next) return;
  const headings: TocItem[] = [];
  next.view.dom.querySelectorAll("h1, h2, h3").forEach((element, index) => {
    const text = element.textContent?.trim() || "";
    if (!text) return;
    const level = Number(element.tagName.slice(1)) as 1 | 2 | 3;
    const id = element.id || `cd-heading-${props.docId}-${index}`;
    element.id = id;
    headings.push({ id, text, level });
  });
  emit("toc", headings);
}

function syncImageSelection(next = editor.value) {
  if (!next) return;
  selectedImage.value = next.isActive("image");
  const attrs = next.getAttributes("image");
  imageWidth.value = attrs.width || "";
  imageCaption.value = attrs.title || attrs.alt || "";
  syncBlockHandle(next);
}

function currentBlockRange(next = editor.value) {
  if (!next) return null;
  const { $from } = next.state.selection;
  if ($from.depth < 1) return null;
  return { from: $from.before(1), to: $from.after(1) };
}

function syncBlockHandle(next = editor.value) {
  const range = currentBlockRange(next);
  if (!next || !range) {
    blockHandle.visible = false;
    return;
  }
  const coords = next.view.coordsAtPos(range.from);
  blockHandle.visible = true;
  blockHandle.top = Math.max(76, coords.top - 2);
  blockHandle.left = Math.max(8, coords.left - 42);
}

function placeCommandMenu(next = editor.value) {
  if (!next) return;
  const coords = next.view.coordsAtPos(next.state.selection.from);
  slashMenu.top = Math.min(window.innerHeight - 280, Math.max(76, coords.bottom + 8));
  slashMenu.left = Math.min(window.innerWidth - 336, Math.max(12, coords.left - 12));
}

function openCommandMenu() {
  const next = editor.value;
  if (!next) return;
  next.chain().focus().run();
  placeCommandMenu(next);
  syncBlockHandle(next);
  slashOpen.value = true;
}

async function uploadAndInsertImage(file: File) {
  pasteUploading.value = true;
  uploadError.value = "";
  try {
    const url = await uploadFile(file, props.docId);
    insertImage(url);
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : "图片上传失败";
  } finally {
    pasteUploading.value = false;
  }
}

async function uploadAndInsertVideo(file: File) {
  pasteUploading.value = true;
  uploadError.value = "";
  try {
    const url = await uploadFile(file, props.docId);
    (editor.value?.chain().focus() as any)?.setVideo({ src: url, title: file.name }).run();
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : "视频上传失败";
  } finally {
    pasteUploading.value = false;
    if (videoInput.value) videoInput.value.value = "";
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
  pasteUploading.value = true;
  uploadError.value = "";
  try {
    const url = await uploadFile(file, props.docId);
    editor.value?.chain().focus().insertContent({
      type: "paragraph",
      content: [{
        type: "text",
        text: file.name,
        marks: [{ type: "link", attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } }]
      }]
    }).run();
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : "文件上传失败";
  } finally {
    pasteUploading.value = false;
  }
}

function moveDraggedBlock(view: Editor["view"], event: DragEvent) {
  const range = draggedBlock.value;
  if (!range) return false;
  const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
  draggedBlock.value = null;
  if (!target || target.pos >= range.from && target.pos <= range.to) return true;
  event.preventDefault();
  const slice = view.state.doc.slice(range.from, range.to);
  let insertAt = target.pos;
  if (insertAt > range.from) insertAt -= range.to - range.from;
  const tr = view.state.tr.delete(range.from, range.to).insert(insertAt, slice.content);
  view.dispatch(tr.scrollIntoView());
  window.setTimeout(() => {
    if (editor.value) emitContent(editor.value);
  });
  return true;
}

function textBeforeCursor(next: Editor) {
  const { $from } = next.state.selection;
  return $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
}

function deleteTypedShortcut(next: Editor, shortcut: "/sp" | "/tp") {
  const to = next.state.selection.from;
  next.chain().focus().deleteRange({ from: Math.max(0, to - shortcut.length), to }).run();
}

function checkTypedShortcut() {
  const next = editor.value;
  if (!next) return;
  const before = textBeforeCursor(next);
  if (before.endsWith("/sp")) {
    deleteTypedShortcut(next, "/sp");
    slashOpen.value = false;
    openVideoPicker();
    return;
  }
  if (before.endsWith("/tp")) {
    deleteTypedShortcut(next, "/tp");
    slashOpen.value = false;
    openImagePicker();
    return;
  }
  if (before.endsWith("/")) {
    openCommandMenu();
  }
}

async function loadEditorRuntime() {
  editorLoading.value = true;
  editorLoadError.value = "";
  const token = ++editorLoadToken;
  try {
    const runtime = await import("./editor-runtime");
    if (token !== editorLoadToken) return;
    editorContentComponent.value = markRaw(runtime.EditorContent);
    editor.value = markRaw(runtime.createChendocEditor({
      content: parseContent(props.contentJson),
      onUpdate: ({ editor: next }: { editor: Editor }) => emitContent(next),
      onSelectionUpdate: ({ editor: next }: { editor: Editor }) => syncImageSelection(next),
      editorProps: {
        attributes: {
          class: "chendoc-editor__surface"
        },
        handlePaste(_view: Editor["view"], event: ClipboardEvent) {
          const file = fileFromPaste(event);
          if (!file) return false;
          event.preventDefault();
          void uploadAndInsertFile(file);
          return true;
        },
        handleDrop(view: Editor["view"], event: DragEvent) {
          const files = Array.from(event.dataTransfer?.files || []);
          if (files.length) {
            event.preventDefault();
            files.forEach((file) => void uploadAndInsertFile(file));
            return true;
          }
          return moveDraggedBlock(view, event);
        },
        handleTextInput(_view: Editor["view"], _from: number, _to: number, text: string) {
          if (text === "/" || text.toLowerCase() === "p") {
            window.setTimeout(checkTypedShortcut);
          }
          return false;
        },
        handleKeyDown(_view: Editor["view"], event: KeyboardEvent) {
          if (event.key === "Escape") slashOpen.value = false;
          return false;
        },
        handleClick(_view: Editor["view"], _pos: number, event: MouseEvent) {
          const target = event.target as HTMLElement;
          const image = target.closest("img");
          if (image?.getAttribute("src")) {
            previewImage.value = image.getAttribute("src") || "";
            return true;
          }
          const pre = target.closest("pre");
          if (pre?.textContent && navigator.clipboard) {
            void navigator.clipboard.writeText(pre.textContent);
            pre.classList.add("is-copied");
            window.setTimeout(() => pre.classList.remove("is-copied"), 1200);
          }
          return false;
        }
      }
    }));
    window.setTimeout(() => {
      collectToc();
      syncImageSelection();
    });
  } catch (error) {
    if (token === editorLoadToken) {
      editorLoadError.value = error instanceof Error ? error.message : "编辑器加载失败";
    }
  } finally {
    if (token === editorLoadToken) editorLoading.value = false;
  }
}

watch(() => [props.docId, props.contentJson] as const, ([nextDocId, nextContentJson], previous) => {
  const next = editor.value;
  if (!next) return;

  const incomingContent = parseContent(nextContentJson);
  const incomingJson = stringifyContent(incomingContent);
  const editorJson = currentEditorContent();
  const previousDocId = previous?.[0];
  const previousJson = previous ? stringifyContent(parseContent(previous[1])) : "";
  const isSameDoc = previousDocId === nextDocId;

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
  void loadEditorRuntime();
});

function insertImage(url: string) {
  editor.value?.chain().focus().setImage({ src: url, alt: "" }).run();
}

function openImagePicker() {
  imageInput.value?.click();
}

function onImageFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void uploadAndInsertImage(file);
  if (imageInput.value) imageInput.value.value = "";
}

function openVideoPicker() {
  videoInput.value?.click();
}

function onVideoFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void uploadAndInsertVideo(file);
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function promptForLink() {
  const next = editor.value;
  if (!next) return;
  const currentUrl = next.getAttributes("link").href || "";
  const input = await nativePrompt({
    title: "链接地址",
    label: "URL",
    value: currentUrl,
    placeholder: "https://example.com",
    confirmText: "应用链接"
  });
  if (input === null) return;
  const url = normalizeUrl(input);
  if (!url) next.chain().focus().unsetLink().run();
  else next.chain().focus().setLink({ href: url, target: "_blank" }).run();
}

function applyStylePatch(patch: EditorStylePatch) {
  Object.assign(editorStyle, patch);
}

function deleteLastSlash() {
  const next = editor.value;
  if (!next) return next;
  const pos = next.state.selection.from;
  const before = pos > 0 ? next.state.doc.textBetween(pos - 1, pos) : "";
  if (before === "/") {
    next.chain().focus().deleteRange({ from: pos - 1, to: pos }).run();
  }
  return next;
}

function runSlash(command: InsertCommand) {
  const next = deleteLastSlash();
  slashOpen.value = false;
  if (!next) return;
  if (command === "paragraph") next.chain().focus().setParagraph().run();
  if (command === "h1") next.chain().focus().toggleHeading({ level: 1 }).run();
  if (command === "h2") next.chain().focus().toggleHeading({ level: 2 }).run();
  if (command === "h3") next.chain().focus().toggleHeading({ level: 3 }).run();
  if (command === "quote") next.chain().focus().toggleBlockquote().run();
  if (command === "code") next.chain().focus().toggleCodeBlock().run();
  if (command === "table") (next.chain().focus() as any).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  if (command === "hr") next.chain().focus().setHorizontalRule().run();
  if (command === "bullet") next.chain().focus().toggleBulletList().run();
  if (command === "ordered") next.chain().focus().toggleOrderedList().run();
  if (command === "task") next.chain().focus().toggleTaskList().run();
  if (command === "link") promptForLink();
  if (command === "size15") applyStylePatch({ fontSize: "15px" });
  if (command === "size16") applyStylePatch({ fontSize: "16px" });
  if (command === "size18") applyStylePatch({ fontSize: "18px" });
  if (command === "size20") applyStylePatch({ fontSize: "20px" });
  if (command === "image") openImagePicker();
  if (command === "video") openVideoPicker();
}

function updateImageAttrs(patch: Record<string, string | null>) {
  (editor.value?.chain().focus() as any)?.updateAttributes("image", patch).run();
  syncImageSelection();
}

function setImageCenter(centered: boolean) {
  updateImageAttrs({ class: centered ? "cd-image-center" : null });
}

function startBlockDrag(event: DragEvent) {
  const range = currentBlockRange();
  if (!range) return;
  draggedBlock.value = range;
  event.dataTransfer?.setData("text/plain", "chendoc-block");
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

onBeforeUnmount(() => {
  editorLoadToken += 1;
  editor.value?.destroy();
});
</script>

<template>
  <section class="chendoc-editor" :style="editorShellStyle">
    <button
      v-if="blockHandle.visible"
      class="chendoc-editor__block-handle"
      type="button"
      draggable="true"
      :style="{ top: `${blockHandle.top}px`, left: `${blockHandle.left}px` }"
      title="插入或移动当前块"
      aria-label="插入或移动当前块"
      @click="openCommandMenu"
      @dragstart="startBlockDrag"
    >⋮⋮</button>
    <EditorToolbar
      :editor="editor"
      @upload-image="openImagePicker"
      @upload-video="openVideoPicker"
      @style-change="applyStylePatch"
    />
    <input ref="imageInput" hidden type="file" accept="image/*" @change="onImageFile" />
    <input ref="videoInput" hidden type="file" accept="video/mp4,video/webm,video/quicktime,video/*" @change="onVideoFile" />

    <div v-if="pasteUploading || uploadError || selectedImage" class="chendoc-editor__upload">
      <span v-if="pasteUploading" class="chendoc-editor__hint">正在上传文件...</span>
      <span v-if="uploadError" class="chendoc-editor__error">{{ uploadError }}</span>
      <div v-if="selectedImage" class="chendoc-editor__image-tools">
        <button type="button" @click="updateImageAttrs({ width: '50%' })">50%</button>
        <button type="button" @click="updateImageAttrs({ width: '75%' })">75%</button>
        <button type="button" @click="updateImageAttrs({ width: '100%' })">100%</button>
        <button type="button" @click="setImageCenter(true)">居中</button>
        <button type="button" @click="setImageCenter(false)">取消居中</button>
        <input v-model="imageCaption" placeholder="图片说明" @change="updateImageAttrs({ title: imageCaption, alt: imageCaption })" />
      </div>
    </div>

    <div v-if="slashOpen" class="chendoc-editor__slash" :style="slashMenuStyle">
      <div class="chendoc-editor__slash-group">
        <span>插入</span>
        <button type="button" @click="runSlash('image')">图片 /tp</button>
        <button type="button" @click="runSlash('video')">视频 /sp</button>
        <button type="button" @click="runSlash('table')">表格</button>
        <button type="button" @click="runSlash('hr')">分割线</button>
        <button type="button" @click="runSlash('link')">链接</button>
      </div>
      <div class="chendoc-editor__slash-group">
        <span>段落</span>
        <button type="button" @click="runSlash('paragraph')">正文</button>
        <button type="button" @click="runSlash('h1')">一级标题</button>
        <button type="button" @click="runSlash('h2')">二级标题</button>
        <button type="button" @click="runSlash('h3')">三级标题</button>
        <button type="button" @click="runSlash('quote')">引用</button>
        <button type="button" @click="runSlash('code')">代码块</button>
      </div>
      <div class="chendoc-editor__slash-group">
        <span>列表</span>
        <button type="button" @click="runSlash('bullet')">无序列表</button>
        <button type="button" @click="runSlash('ordered')">有序列表</button>
        <button type="button" @click="runSlash('task')">待办列表</button>
      </div>
      <div class="chendoc-editor__slash-group chendoc-editor__slash-group--compact">
        <span>默认字号</span>
        <button type="button" @click="runSlash('size15')">15</button>
        <button type="button" @click="runSlash('size16')">16</button>
        <button type="button" @click="runSlash('size18')">18</button>
        <button type="button" @click="runSlash('size20')">20</button>
      </div>
    </div>

    <div v-if="editorLoadError" class="chendoc-editor__runtime-state is-error">
      <strong>编辑器加载失败</strong>
      <span>{{ editorLoadError }}</span>
    </div>
    <div v-else-if="editorLoading || !editor || !editorContentComponent" class="chendoc-editor__runtime-state" aria-label="编辑器加载中">
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
    </div>
    <component v-else :is="editorContentComponent" class="chendoc-editor__content" :editor="editor" />

    <button v-if="previewImage" class="chendoc-editor__preview" type="button" @click="previewImage = ''">
      <img :src="previewImage" alt="" />
    </button>
  </section>
</template>
