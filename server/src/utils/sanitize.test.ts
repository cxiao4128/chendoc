import { describe, expect, it } from "vitest";
import { renderContentJsonToHtml, sanitizeDocumentHtml } from "./sanitize.js";

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
});
