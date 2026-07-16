import { enableAutoUnmount, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DocEditorMobileSheet from "./DocEditorMobileSheet.vue";

const sheetCss = readFileSync(resolve(process.cwd(), "src/pages/docs/css/doc-editor-mobile-sheet-panel.css"), "utf8");
type ViewportListener = () => void;
enableAutoUnmount(afterEach);

describe("mobile document sheet", () => {
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
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("moves above the keyboard and caps itself to the visible viewport", async () => {
    const wrapper = mount(DocEditorMobileSheet, {
      attachTo: document.body,
      props: { panel: null, title: "测试文档" },
      slots: { share: '<input aria-label="分享密码" />' },
    });
    await wrapper.setProps({ panel: "share" });
    await nextTick();
    document.body.querySelector<HTMLInputElement>('[aria-label="分享密码"]')?.focus();
    visualViewport.height = 500;
    listeners.get("resize")?.();
    await nextTick();

    const sheet = document.body.querySelector<HTMLElement>(".doc-editor-page__mobile-sheet");
    expect(sheet?.getAttribute("style")).toContain("--mobile-keyboard-offset: 344px");
    expect(sheet?.getAttribute("style")).toContain("--mobile-visible-height: 500px");
    expect(sheetCss).toContain("bottom: var(--mobile-keyboard-offset, 0px)");
    expect(sheetCss).toContain("var(--mobile-visible-height, 100dvh)");
  });

  it("preserves the original opener while switching panels", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(DocEditorMobileSheet, {
      attachTo: document.body,
      props: { panel: null, title: "测试文档" },
      slots: { share: "<button>分享操作</button>", more: "<button>更多操作</button>" },
    });

    await wrapper.setProps({ panel: "share" });
    await wrapper.setProps({ panel: "more" });
    await wrapper.setProps({ panel: null });
    await nextTick();

    expect(document.activeElement).toBe(opener);
  });
});
