import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DocEditorSharePanel from "./DocEditorSharePanel.vue";

function mountPanel() {
  return mount(DocEditorSharePanel, {
    props: {
      shareEnabled: false,
      shareCodeInput: "",
      customSlugInput: "",
      sharePassword: "",
      isAdmin: true,
      share: null,
      shareUrl: "",
      shareLoading: false,
      shareHasPassword: false,
      shareStateText: "未公开",
      shareAccessText: "当前无人可访问",
      shareExpiryText: "长期有效",
      shareMessage: "",
      shareStatusIsError: false,
      shareReviewText: "",
    },
  });
}

describe("DocEditorSharePanel autofill contract", () => {
  it("does not expose the custom slug as an account username field", () => {
    const input = mountPanel().get<HTMLInputElement>('input[name="chendoc-share-custom-slug"]');

    expect(input.attributes("type")).toBe("text");
    expect(input.attributes("autocomplete")).toBe("off");
    expect(input.attributes("autocapitalize")).toBe("none");
    expect(input.attributes("spellcheck")).toBe("false");
    expect(input.attributes("data-form-type")).toBe("other");
    expect(input.attributes("data-1p-ignore")).toBe("true");
    expect(input.attributes("data-lpignore")).toBe("true");
    expect(input.attributes("data-bwignore")).toBe("true");
  });

  it("marks the share password as isolated from the account password", () => {
    const input = mountPanel().get<HTMLInputElement>('input[name="chendoc-share-access-password"]');

    expect(input.attributes("type")).toBe("password");
    expect(input.attributes("autocomplete")).toBe("section-doc-share new-password");
    expect(input.attributes("autocomplete")).not.toContain("current-password");
    expect(input.attributes("data-form-type")).toBe("other");
    expect(input.attributes("data-1p-ignore")).toBe("true");
    expect(input.attributes("data-lpignore")).toBe("true");
    expect(input.attributes("data-bwignore")).toBe("true");
  });
});
