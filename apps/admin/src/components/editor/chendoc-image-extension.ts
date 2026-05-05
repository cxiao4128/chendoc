import Image from "@tiptap/extension-image";

export const ChendocImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes) => attributes.width ? { width: attributes.width } : {}
      },
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute("class"),
        renderHTML: (attributes) => attributes.class ? { class: attributes.class } : {}
      }
    };
  }
});
