import { Editor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import UnderlineExtension from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { ChendocImage } from "./chendoc-image-extension";
import { Video } from "./video-extension";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";

const lowlight = createLowlight({
  bash,
  c,
  cpp,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  php,
  plaintext,
  python,
  rust,
  shell,
  sql,
  typescript,
  xml,
  yaml
});

lowlight.registerAlias({
  bash: ["sh", "zsh"],
  javascript: ["js", "jsx"],
  markdown: ["md"],
  typescript: ["ts", "tsx"],
  xml: ["html", "vue"],
  yaml: ["yml"]
});

export function createChendocEditor(options: Record<string, unknown>) {
  return new Editor({
    ...(options as any),
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      UnderlineExtension,
      TextStyle,
      FontFamily,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({ lowlight }),
      ChendocImage.configure({ HTMLAttributes: { loading: "lazy" } }),
      Video,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" }
      }),
      Placeholder.configure({ placeholder: "正文" })
    ] as any
  });
}

export { EditorContent };
export type { Editor };
