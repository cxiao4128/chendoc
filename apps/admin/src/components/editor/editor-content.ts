import type { Editor } from "@tiptap/vue-3";

export function parseContent(value: string) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
}

export function stringifyContent(value: unknown) {
  return JSON.stringify(value);
}

export function editorTextLength(editor: Editor) {
  return editor.getText().replace(/\s+/g, "").length;
}

export function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function fileFromPaste(event: ClipboardEvent) {
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
