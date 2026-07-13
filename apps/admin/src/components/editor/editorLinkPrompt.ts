import type { ShallowRef } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { nativePrompt } from "../../services/nativeDialog";
import { normalizeUrl } from "./editor-content";

export async function promptForLink(editor: ShallowRef<Editor | null>) {
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
