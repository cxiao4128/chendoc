import type { Editor } from "@tiptap/vue-3";

export interface TocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

export interface EditorStylePatch {
  fontSize?: string;
  lineHeight?: string;
  paragraphGap?: string;
}

export type MobileToolbarSheet = "format" | "list" | "insert";

export type InsertCommand =
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

type BaseCommandChain = ReturnType<Editor["chain"]>;

export type TipTapCommandChain = BaseCommandChain & {
  setVideo: (attrs: { src: string; title?: string }) => BaseCommandChain;
  insertTable: (attrs: { rows: number; cols: number; withHeaderRow: boolean }) => BaseCommandChain;
  updateAttributes: (typeOrName: string, attrs: Record<string, string | null>) => BaseCommandChain;
};
