import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EditorHiddenFileInputs from "./EditorHiddenFileInputs.vue";

describe("EditorHiddenFileInputs", () => {
  it("exposes a common-document attachment picker and emits the selected file", async () => {
    const wrapper = mount(EditorHiddenFileInputs);
    const input = wrapper.get<HTMLInputElement>('[data-testid="editor-attachment-input"]');
    const file = new File(["notes"], "notes.md", { type: "text/markdown" });

    expect(input.attributes("accept")).toContain(".pdf");
    expect(input.attributes("accept")).toContain(".md");
    expect(input.attributes("accept")).not.toContain(".csv");
    expect(input.attributes("accept")).not.toContain(".rar");
    Object.defineProperty(input.element, "files", { configurable: true, value: [file] });
    await input.trigger("change");

    expect(wrapper.emitted("attachment")?.[0]).toEqual([file]);
  });

  it("keeps HEIC and MOV selectable on mobile pickers", () => {
    const wrapper = mount(EditorHiddenFileInputs);

    expect(wrapper.get('[data-testid="editor-image-input"]').attributes("accept")).toContain(".heic");
    expect(wrapper.get('[data-testid="editor-video-input"]').attributes("accept")).toContain(".mov");
  });
});
