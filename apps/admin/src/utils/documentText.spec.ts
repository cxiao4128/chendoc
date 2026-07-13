import { describe, expect, it } from "vitest";
import { textLengthFromContentJson } from "./documentText";

describe("textLengthFromContentJson", () => {
  it("统计嵌套文本并忽略空白", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "标题" }] },
        { type: "paragraph", content: [{ type: "text", text: "正 文" }] },
      ],
    });

    expect(textLengthFromContentJson(content)).toBe(4);
  });

  it("无效 JSON 返回 0", () => {
    expect(textLengthFromContentJson("{")).toBe(0);
  });
});
