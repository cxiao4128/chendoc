import { describe, expect, it } from "vitest";
import { renderContentJsonToHtml, renderStoredDocumentHtml, sanitizeDocumentHtml } from "./sanitize.js";

describe("sanitizeDocumentHtml", () => {
  const cases = [
    ["script", '<p>ok</p><script>alert(1)</script>'],
    ["iframe", '<iframe src="https://example.com"></iframe><p>ok</p>'],
    ["xmp", "<xmp><img src=x onerror=alert(1)></xmp><p>ok</p>"],
    ["svg", '<svg><script>alert(1)</script></svg><p>ok</p>'],
    ["onerror", '<img src="https://example.com/a.png" onerror="alert(1)">'],
    ["onclick", '<p onclick="alert(1)">ok</p>'],
    ["javascript", '<a href="javascript:alert(1)">x</a>'],
    ["data html", '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
    ["style injection", '<span style="background:url(javascript:alert(1));font-family:Arial">x</span>']
  ] as const;

  it.each(cases)("removes dangerous %s payloads", (_name, input) => {
    const html = sanitizeDocumentHtml(input);
    expect(html).not.toMatch(/<script|<iframe|<xmp|<svg|onerror|onclick|javascript:|data:text\/html|background/i);
  });

  it("renders contentJson instead of trusting submitted html", () => {
    const html = renderContentJsonToHtml(JSON.stringify({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "hello " },
          { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }
        ]
      }]
    }));

    expect(html).toContain("<p>hello link</p>");
    expect(html).not.toContain("javascript:");
  });

  it("keeps only strict six-digit text and highlight colors", () => {
    const html = sanitizeDocumentHtml(
      '<span style="color:#D7263D">red</span>'
      + '<mark style="background-color:#FFF176;color:#D7263D">yellow</mark>'
      + '<span style="color:#fff">short</span>'
      + '<mark style="background-color:rgb(1,2,3)">rgb</mark>'
    );

    expect(html).toContain('<span style="color:#D7263D">red</span>');
    expect(html).toContain('<mark style="background-color:#FFF176">yellow</mark>');
    expect(html).toContain("<span>short</span>");
    expect(html).toContain("<mark>rgb</mark>");
    expect(html).not.toContain("color:#fff");
    expect(html).not.toContain("rgb(");
  });

  it("drops style injection while preserving an independent safe color", () => {
    const html = sanitizeDocumentHtml(
      '<span style="color:#D7263D;background-image:url(javascript:alert(1));width:expression(alert(1))">safe</span>'
      + '<mark style="background-color:#FFF176;background-image:url(https://evil.example/x)">marked</mark>'
    );

    expect(html).toContain("color:#D7263D");
    expect(html).toContain("background-color:#FFF176");
    expect(html).not.toMatch(/javascript:|expression|background-image|evil\.example/i);
  });

  it("renders TipTap textStyle and highlight marks from contentJson", () => {
    const html = renderContentJsonToHtml(JSON.stringify({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "重点",
          marks: [
            { type: "textStyle", attrs: { color: "#D7263D" } },
            { type: "highlight", attrs: { color: "#FFF176" } }
          ]
        }]
      }]
    }));

    expect(html).toContain('<mark style="background-color:#FFF176"><span style="color:#D7263D">重点</span></mark>');
  });

  it("keeps a safe font family when rebuilding canonical contentJson", () => {
    const html = renderContentJsonToHtml(JSON.stringify({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "宋体正文",
          marks: [{ type: "textStyle", attrs: { fontFamily: "'SimSun', serif", color: "#374151" } }]
        }]
      }]
    }));

    expect(html).toContain("color:#374151");
    expect(html).toContain("font-family:'SimSun', serif");
  });

  it("never emits invalid color attributes from contentJson", () => {
    const html = renderContentJsonToHtml(JSON.stringify({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "unsafe",
          marks: [
            { type: "textStyle", attrs: { color: "#123456;background:url(javascript:alert(1))" } },
            { type: "highlight", attrs: { color: "red" } }
          ]
        }]
      }]
    }));

    expect(html).toContain("<mark>unsafe</mark>");
    expect(html).not.toMatch(/style=|javascript:|background:url|color:red/i);
  });

  it("rebuilds legacy flattened HTML from canonical contentJson", () => {
    const html = renderStoredDocumentHtml(JSON.stringify({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "重点",
          marks: [
            { type: "textStyle", attrs: { color: "#D7263D" } },
            { type: "highlight", attrs: { color: "#FFF176" } }
          ]
        }]
      }]
    }), "<p>重点</p>");

    expect(html).toContain('<mark style="background-color:#FFF176"><span style="color:#D7263D">重点</span></mark>');
  });

  it("keeps sanitized HTML-only legacy content when normalized JSON is empty", () => {
    const emptyJson = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
    const html = renderStoredDocumentHtml(
      emptyJson,
      '<p>旧正文 <span style="color:#D7263D">保留</span></p><script>alert(1)</script>'
    );

    expect(html).toContain("旧正文");
    expect(html).toContain('<span style="color:#D7263D">保留</span>');
    expect(html).not.toMatch(/<script|alert\(1\)/i);
  });
});
