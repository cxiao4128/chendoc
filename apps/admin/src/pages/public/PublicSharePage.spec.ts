import { mount } from "@vue/test-utils";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import PublicSharePage from "./PublicSharePage.vue";

const mocks = vi.hoisted(() => ({
  route: { params: { shareKey: "111" } },
  getPublicShareApi: vi.fn(),
  verifyPublicSharePasswordApi: vi.fn(),
  getPublicShareSiteConfigApi: vi.fn()
}));

vi.mock("vue-router", () => ({ useRoute: () => mocks.route }));
vi.mock("@/services/api/public-share.api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/api/public-share.api")>();
  return {
    ...original,
    getPublicShareApi: mocks.getPublicShareApi,
    getPublicShareSiteConfigApi: mocks.getPublicShareSiteConfigApi,
    verifyPublicSharePasswordApi: mocks.verifyPublicSharePasswordApi
  };
});

const siteConfig = {
  brandName: "陈书 / ChensDoc",
  shortName: "陈书",
  logoUrl: "",
  authWallpaperUrl: "",
  preferRemoteLogo: false,
  preferRemoteWallpaper: false,
  copyright: "",
  recoveryContact: "",
  shareFooterText: "保留作者署名"
};

const unlockedShare = {
  doc: {
    title: "公开正文",
    summary: "摘要",
    coverUrl: "",
    updatedAt: "2026-07-12T00:00:00.000Z",
    contentHtml: "<p><strong>正文内容</strong></p>"
  },
  share: { shareId: 111, customSlug: null, viewCount: 2 },
  protected: false,
  unlocked: true
};

describe("PublicSharePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.route.params.shareKey = "111";
    mocks.getPublicShareSiteConfigApi.mockResolvedValue({ config: siteConfig });
  });

  test("renders the public document as the primary content", async () => {
    mocks.getPublicShareApi.mockResolvedValue(unlockedShare);

    const wrapper = mount(PublicSharePage);
    await flushPromises();

    expect(mocks.getPublicShareApi).toHaveBeenCalledWith("111");
    expect(wrapper.get("h1").text()).toBe("公开正文");
    expect(wrapper.get("article").html()).toContain("<strong>正文内容</strong>");
    expect(wrapper.text()).toContain("保留作者署名");
    expect(wrapper.text()).not.toContain("更新于");
    expect(wrapper.text()).not.toContain("分钟阅读");
    expect(document.title).toBe("公开正文 - 陈书");
  });

  test("keeps server-sanitized text color and highlight markup", async () => {
    mocks.getPublicShareApi.mockResolvedValue({
      ...unlockedShare,
      doc: {
        ...unlockedShare.doc,
        contentHtml: '<p><mark style="background-color:#FFF176"><span style="color:#D7263D">重点</span></mark></p>'
      }
    });

    const wrapper = mount(PublicSharePage);
    await flushPromises();

    expect(wrapper.get("article mark").attributes("style")).toContain("background-color");
    expect(wrapper.get("article span").attributes("style")).toContain("color");
    expect(wrapper.get("article mark").text()).toBe("重点");
  });

  test("keeps the password token in memory and unlocks through p2 then p3", async () => {
    mocks.getPublicShareApi
      .mockResolvedValueOnce({
        doc: {},
        share: { shareId: 111, customSlug: null, viewCount: 0 },
        protected: true,
        unlocked: false
      })
      .mockResolvedValueOnce({ ...unlockedShare, protected: true });
    mocks.verifyPublicSharePasswordApi.mockResolvedValue({ ok: true, token: "share-token" });

    const wrapper = mount(PublicSharePage);
    await flushPromises();

    const input = wrapper.get<HTMLInputElement>("#public-share-password");
    expect(input.attributes("autocomplete")).toBe("section-public-share new-password");
    expect(input.attributes("data-1p-ignore")).toBe("true");

    await input.setValue("correct horse");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.verifyPublicSharePasswordApi).toHaveBeenCalledWith("111", "correct horse");
    expect(mocks.getPublicShareApi).toHaveBeenLastCalledWith("111", "share-token");
    expect(wrapper.get("article").text()).toContain("正文内容");
  });
});
