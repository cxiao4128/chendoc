import { Node, mergeAttributes } from "@tiptap/core";

export const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      title: { default: null }
    };
  },
  parseHTML() {
    return [{ tag: "video[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", { class: "cd-video" }, ["video", mergeAttributes(HTMLAttributes, { controls: "controls", preload: "metadata" })], ["figcaption", HTMLAttributes.title || ""]];
  },
  addCommands() {
    return {
      setVideo: (attrs: { src: string; title?: string }) => ({ commands }) => commands.insertContent({ type: this.name, attrs })
    };
  }
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: {
      setVideo: (attrs: { src: string; title?: string }) => ReturnType;
    };
  }
}
