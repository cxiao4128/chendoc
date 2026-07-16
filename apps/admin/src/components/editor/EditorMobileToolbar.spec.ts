import { enableAutoUnmount, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/vue-3";
import EditorToolbar from "./EditorToolbar.vue";

const mobileToolbarCss = readFileSync(resolve(process.cwd(), "src/components/editor/editor-toolbar-sticky.css"), "utf8");
const responsiveToolbarCss = readFileSync(resolve(process.cwd(), "src/components/editor/editor-toolbar-responsive.css"), "utf8");
const mobileMenuCss = readFileSync(resolve(process.cwd(), "src/components/editor/editor-toolbar-mobile-menu.css"), "utf8");
const responsiveEditorCss = readFileSync(resolve(process.cwd(), "src/components/editor/chendoc-editor-responsive.css"), "utf8");
const mobileTopCss = readFileSync(resolve(process.cwd(), "src/pages/docs/css/doc-editor-mobile-top.css"), "utf8");
enableAutoUnmount(afterEach);

type ViewportListener = () => void;

function editorStub() {
  const chain = {
    focus: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    run: vi.fn(),
    toggleBold: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>>;
  Object.values(chain).forEach((command) => command.mockReturnValue(chain));
  const editor = {
    isActive: vi.fn().mockReturnValue(false),
    getAttributes: vi.fn().mockReturnValue({}),
    chain: vi.fn().mockReturnValue(chain),
  } as unknown as Editor & { __chain: typeof chain };
  editor.__chain = chain;
  return editor;
}

describe("mobile editor toolbar", () => {
  const listeners = new Map<string, ViewportListener>();
  const visualViewport = {
    height: 844,
    offsetTop: 0,
    scale: 1,
    addEventListener: vi.fn((name: string, listener: ViewportListener) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
  };

  beforeEach(() => {
    listeners.clear();
    visualViewport.height = 844;
    visualViewport.offsetTop = 0;
    visualViewport.scale = 1;
    Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 844 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders six equal-track actions without a horizontal scrolling contract at 390×844", () => {
    const wrapper = mount(EditorToolbar, { props: { editor: editorStub() } });
    const toolbar = wrapper.get('[data-testid="mobile-editor-toolbar"]');

    expect(toolbar.findAll("button")).toHaveLength(6);
    expect(mobileToolbarCss).toContain("grid-template-columns: repeat(6, minmax(44px, 1fr))");
    expect(mobileToolbarCss).toContain("position: fixed");
    expect(mobileToolbarCss).not.toMatch(/overflow-x:\s*auto/);
  });

  it("keeps the desktop primary and secondary tool groups as horizontal flex rows", () => {
    const wrapper = mount(EditorToolbar, { props: { editor: editorStub() } });

    expect(wrapper.get(".editor-toolbar__primary--desktop").find('[aria-label="加粗"]').exists()).toBe(true);
    expect(wrapper.get(".editor-toolbar__secondary").find('[aria-label="文本颜色"]').exists()).toBe(true);
    expect(responsiveToolbarCss).toMatch(/\.editor-toolbar__primary,\s*\.editor-toolbar__secondary\s*{\s*display:\s*flex/);
    expect(responsiveToolbarCss).toContain(".editor-toolbar__primary--desktop");
  });

  it("opens the insert sheet and routes attachment selection to the editor", async () => {
    const wrapper = mount(EditorToolbar, { props: { editor: editorStub() } });
    await wrapper.get('[aria-label="插入更多内容"]').trigger("click");
    const attachment = document.body.querySelector<HTMLButtonElement>('[data-testid="mobile-upload-attachment"]');

    expect(attachment).not.toBeNull();
    attachment?.click();
    await nextTick();
    expect(wrapper.emitted("uploadAttachment")).toHaveLength(1);
  });

  it("keeps editor focus after a sheet command and restores the opener only when cancelled", async () => {
    const editable = document.createElement("textarea");
    document.body.append(editable);
    editable.focus();
    const editor = editorStub();
    editor.__chain.focus.mockImplementation(() => {
      editable.focus();
      return editor.__chain;
    });
    const wrapper = mount(EditorToolbar, { attachTo: document.body, props: { editor } });

    await wrapper.get('[aria-label="文字格式"]').trigger("click");
    await nextTick();
    expect(document.activeElement).toBe(editable);

    const bold = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("粗体"));
    bold?.click();
    await nextTick();
    expect(editor.__chain.focus).toHaveBeenCalled();
    expect(document.activeElement).toBe(editable);

    const opener = wrapper.get('[aria-label="文字格式"]').element as HTMLButtonElement;
    opener.focus();
    await wrapper.get('[aria-label="文字格式"]').trigger("click");
    await nextTick();
    document.body.querySelector<HTMLButtonElement>('.editor-toolbar__sheet-head [aria-label="关闭工具面板"]')?.click();
    await nextTick();
    expect(document.activeElement).toBe(opener);
  });

  it("moves the fixed toolbar above the VisualViewport keyboard inset", async () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const wrapper = mount(EditorToolbar, { props: { editor: editorStub() } });
    visualViewport.height = 510;
    visualViewport.offsetTop = 10;
    listeners.get("resize")?.();
    await nextTick();

    expect(wrapper.get(".editor-toolbar-wrap").attributes("style")).toContain("--mobile-keyboard-offset: 324px");
    expect(wrapper.get(".editor-toolbar-wrap").classes()).toContain("has-keyboard");
  });

  it("ignores browser bars, page zoom, and non-editable focus as keyboard insets", async () => {
    const input = document.createElement("input");
    const button = document.createElement("button");
    document.body.append(input, button);
    input.focus();
    const wrapper = mount(EditorToolbar, { props: { editor: editorStub() } });

    visualViewport.height = 760;
    listeners.get("resize")?.();
    await nextTick();
    expect(wrapper.get(".editor-toolbar-wrap").attributes("style")).toContain("--mobile-keyboard-offset: 0px");

    visualViewport.height = 510;
    visualViewport.scale = 1.2;
    listeners.get("resize")?.();
    await nextTick();
    expect(wrapper.get(".editor-toolbar-wrap").attributes("style")).toContain("--mobile-keyboard-offset: 0px");

    visualViewport.scale = 1;
    button.focus();
    listeners.get("resize")?.();
    await nextTick();
    expect(wrapper.get(".editor-toolbar-wrap").classes()).not.toContain("has-keyboard");
  });

  it("keeps mobile touch targets and landscape safe areas at accessible sizes", () => {
    expect(mobileMenuCss).toMatch(/\.editor-toolbar__palette button\s*{[^}]*width:\s*44px;[^}]*height:\s*44px/s);
    expect(responsiveEditorCss).toMatch(/\.chendoc-editor__image-tools button\s*{[^}]*min-height:\s*44px/s);
    expect(responsiveEditorCss).toMatch(/\.chendoc-editor__slash button\s*{[^}]*min-height:\s*44px/s);
    expect(mobileTopCss).toMatch(/\.doc-editor-page__mobile-save\.is-error\s*{[^}]*min-height:\s*44px/s);
    expect(mobileToolbarCss).toContain("env(safe-area-inset-left)");
    expect(mobileToolbarCss).toContain("env(safe-area-inset-right)");
  });
});
