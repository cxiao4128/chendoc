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
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { ChendocImage } from "./chendoc-image-extension";
import { Video } from "./video-extension";

// 核心语言（常用）
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import python from "highlight.js/lib/languages/python";
import plaintext from "highlight.js/lib/languages/plaintext";

// 延迟加载的语言（不常用）
const lazyLanguages = {
  c: () => import("highlight.js/lib/languages/c").then(m => m.default),
  cpp: () => import("highlight.js/lib/languages/cpp").then(m => m.default),
  go: () => import("highlight.js/lib/languages/go").then(m => m.default),
  java: () => import("highlight.js/lib/languages/java").then(m => m.default),
  markdown: () => import("highlight.js/lib/languages/markdown").then(m => m.default),
  php: () => import("highlight.js/lib/languages/php").then(m => m.default),
  rust: () => import("highlight.js/lib/languages/rust").then(m => m.default),
  shell: () => import("highlight.js/lib/languages/shell").then(m => m.default),
  sql: () => import("highlight.js/lib/languages/sql").then(m => m.default),
  yaml: () => import("highlight.js/lib/languages/yaml").then(m => m.default)
};

// 创建低亮实例（仅核心语言）
const lowlight = createLowlight({
  bash,
  javascript,
  typescript,
  css,
  json,
  xml,
  python,
  plaintext
});

// 延迟注册不常用语言
lowlight.registerAlias({
  bash: ["sh", "zsh"],
  javascript: ["js", "jsx"],
  markdown: ["md"],
  typescript: ["ts", "tsx"],
  xml: ["html", "vue"],
  yaml: ["yml"]
});

// 懒加载其他语言
async function loadLazyLanguages() {
  const results = await Promise.allSettled(
    Object.entries(lazyLanguages).map(async ([name, loader]) => {
      const lang = await loader();
      lowlight.register(name, lang);
    })
  );
  const failed = results.filter(r => r.status === "rejected");
  if (failed.length) {
    console.warn(`[ChendocEditor] Failed to load ${failed.length} highlight languages`);
  }
}

// 启动懒加载（不影响首屏）
if (typeof window !== "undefined") {
  const scheduleIdle = typeof window.requestIdleCallback === "function"
    ? window.requestIdleCallback.bind(window)
    : (callback: IdleRequestCallback) => window.setTimeout(() => callback({
      didTimeout: false,
      timeRemaining: () => 0
    } as IdleDeadline), 0);
  scheduleIdle(() => void loadLazyLanguages(), { timeout: 2000 });
}

export function createChendocEditor(options: Record<string, unknown>) {
  return new Editor({
    ...(options as any),
    extensions: [
      // StarterKit 已内置 link 和 underline，这里排除它们以避免重复
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false
      }),
      // 单独配置 link 和 underline 以获得更好的控制
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank"
        }
      }),
      UnderlineExtension,
      TextStyle,
      FontFamily,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: "plaintext",
        HTMLAttributes: {
          // 性能优化：延迟渲染长代码块
          class: "chendoc-code-block"
        }
      }),
      ChendocImage.configure({
        HTMLAttributes: {
          loading: "lazy",
          decoding: "async"
        }
      }),
      Video,
      Color,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({
        placeholder: "正文"
      })
    ] as any,
    // TipTap 编辑器性能配置
    immediatelyRender: false, // 延迟渲染，改善首屏
    shouldRerenderOnTransaction: true
  });
}

export { EditorContent };
export type { Editor };
