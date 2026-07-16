import sanitizeHtml from "sanitize-html";

type JsonNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: JsonNode[];
};

const dangerousTags = new Set(["script", "iframe", "xmp", "svg", "math", "style", "object", "embed"]);
const strictHexColor = /^#[0-9a-fA-F]{6}$/;
const strictFontFamily = /^[-,"'\w\s]+(?:,\s*[-,"'\w\s]+)*$/;
const meaningfulLeafNodes = new Set(["hardBreak", "horizontalRule", "image", "video", "table", "codeBlock"]);

export function sanitizeDocumentHtml(input: string) {
  return sanitizeHtml(input, {
    disallowedTagsMode: "discard",
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags.filter((tag) => !dangerousTags.has(tag)),
      "img",
      "video",
      "source",
      "figure",
      "figcaption",
      "span",
      "mark",
      "label",
      "input",
      "hr",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td"
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      span: ["class", "style"],
      mark: ["style"],
      video: ["src", "controls", "preload", "poster", "width", "height"],
      source: ["src", "type"],
      input: ["type", "checked", "disabled"],
      ul: ["data-type"],
      li: ["data-type"],
      "*": ["class"]
    },
    allowedStyles: {
      span: {
        "font-family": [strictFontFamily],
        color: [strictHexColor]
      },
      mark: {
        "background-color": [strictHexColor]
      }
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https"],
      video: ["http", "https"],
      source: ["http", "https"],
      a: ["http", "https", "mailto", "tel"]
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          target: attribs.target === "_blank" ? "_blank" : attribs.target,
          rel: "noopener noreferrer"
        }
      }),
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: {
          ...attribs,
          loading: "lazy"
        }
      }),
      video: (_tagName, attribs) => ({
        tagName: "video",
        attribs: {
          ...attribs,
          controls: attribs.controls ?? "controls",
          preload: "metadata"
        }
      })
    }
  });
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function attrString(attrs: Record<string, string | number | boolean | null | undefined>) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => value === true ? ` ${key}` : ` ${key}="${escapeHtml(String(value))}"`)
    .join("");
}

function asText(value: unknown, max = 500) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function safeUrl(value: unknown, allowed: Array<"http" | "https" | "mailto" | "tel"> = ["http", "https"]) {
  const raw = asText(value, 2000).trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://chendoc.local");
    const protocol = url.protocol.replace(":", "") as "http" | "https" | "mailto" | "tel";
    if (!allowed.includes(protocol)) return "";
    if (url.protocol === "https:" || url.protocol === "http:") return raw;
    return raw;
  } catch {
    return "";
  }
}

function safeHexColor(value: unknown) {
  if (typeof value !== "string") return "";
  const color = value.trim();
  return strictHexColor.test(color) ? color : "";
}

function safeFontFamily(value: unknown) {
  if (typeof value !== "string") return "";
  const fontFamily = value.trim();
  return strictFontFamily.test(fontFamily) ? fontFamily : "";
}

function renderChildren(node: JsonNode) {
  return (node.content || []).map(renderJsonNode).join("");
}

function renderMarkedText(node: JsonNode) {
  let out = escapeHtml(node.text || "");
  for (const mark of node.marks || []) {
    if (mark.type === "bold") out = `<strong>${out}</strong>`;
    else if (mark.type === "italic") out = `<em>${out}</em>`;
    else if (mark.type === "underline") out = `<u>${out}</u>`;
    else if (mark.type === "strike") out = `<s>${out}</s>`;
    else if (mark.type === "code") out = `<code>${out}</code>`;
    else if (mark.type === "textStyle") {
      const color = safeHexColor(mark.attrs?.color);
      const fontFamily = safeFontFamily(mark.attrs?.fontFamily);
      const styles = [color ? `color:${color}` : "", fontFamily ? `font-family:${fontFamily}` : ""].filter(Boolean);
      if (styles.length) out = `<span style="${styles.join(";")}">${out}</span>`;
    } else if (mark.type === "highlight") {
      const color = safeHexColor(mark.attrs?.color);
      out = color ? `<mark style="background-color:${color}">${out}</mark>` : `<mark>${out}</mark>`;
    } else if (mark.type === "link") {
      const href = safeUrl(mark.attrs?.href, ["http", "https", "mailto", "tel"]);
      if (href) out = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${out}</a>`;
    }
  }
  return out;
}

function renderJsonNode(node: JsonNode): string {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return renderMarkedText(node);
  if (node.type === "doc") return renderChildren(node);
  if (node.type === "paragraph") return `<p>${renderChildren(node) || "<br>"}</p>`;
  if (node.type === "heading") {
    const level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 2));
    return `<h${level}>${renderChildren(node)}</h${level}>`;
  }
  if (node.type === "blockquote") return `<blockquote>${renderChildren(node)}</blockquote>`;
  if (node.type === "bulletList") return `<ul>${renderChildren(node)}</ul>`;
  if (node.type === "orderedList") return `<ol>${renderChildren(node)}</ol>`;
  if (node.type === "taskList") return `<ul data-type="taskList">${renderChildren(node)}</ul>`;
  if (node.type === "listItem") return `<li>${renderChildren(node)}</li>`;
  if (node.type === "taskItem") {
    const checked = node.attrs?.checked === true;
    return `<li data-type="taskItem"><label><input type="checkbox"${checked ? " checked" : ""} disabled><span>${renderChildren(node)}</span></label></li>`;
  }
  if (node.type === "codeBlock") return `<pre><code>${escapeHtml((node.content || []).map((item) => item.text || "").join(""))}</code></pre>`;
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "horizontalRule") return "<hr>";
  if (node.type === "image") {
    const src = safeUrl(node.attrs?.src);
    if (!src) return "";
    return `<img${attrString({
      src,
      alt: asText(node.attrs?.alt, 240),
      title: asText(node.attrs?.title, 240),
      width: asText(node.attrs?.width, 24),
      class: asText(node.attrs?.class, 80),
      loading: "lazy"
    })}>`;
  }
  if (node.type === "video") {
    const src = safeUrl(node.attrs?.src);
    if (!src) return "";
    const title = asText(node.attrs?.title, 240);
    return `<figure class="cd-video"><video${attrString({ src, controls: true, preload: "metadata" })}></video>${title ? `<figcaption>${escapeHtml(title)}</figcaption>` : ""}</figure>`;
  }
  if (node.type === "table") return `<table>${renderChildren(node)}</table>`;
  if (node.type === "tableRow") return `<tr>${renderChildren(node)}</tr>`;
  if (node.type === "tableHeader") return `<th>${renderChildren(node)}</th>`;
  if (node.type === "tableCell") return `<td>${renderChildren(node)}</td>`;
  return renderChildren(node);
}

function parseContentJson(input: string | null | undefined) {
  try {
    const parsed = JSON.parse(input || "{}") as JsonNode;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function hasMeaningfulContent(node: JsonNode): boolean {
  if (node.type === "text") return typeof node.text === "string" && node.text.length > 0;
  if (node.type && meaningfulLeafNodes.has(node.type)) return true;
  if (node.type === "taskItem" && node.attrs?.checked === true) return true;
  return Array.isArray(node.content) && node.content.some(hasMeaningfulContent);
}

export function renderContentJsonToHtml(input: string) {
  const parsed = parseContentJson(input);
  if (!parsed) return "<p></p>";
  return sanitizeDocumentHtml(renderJsonNode(parsed) || "<p></p>");
}

/**
 * Rebuild persisted HTML from canonical TipTap JSON when it contains content.
 * Legacy HTML-only records fall back to their sanitized HTML instead of being
 * replaced by the normalized empty-document JSON.
 */
export function renderStoredDocumentHtml(contentJson: string | null | undefined, contentHtml: string | null | undefined) {
  const parsed = parseContentJson(contentJson);
  if (parsed?.type === "doc" && hasMeaningfulContent(parsed)) {
    return sanitizeDocumentHtml(renderJsonNode(parsed) || "<p></p>");
  }

  const safeLegacyHtml = sanitizeDocumentHtml(contentHtml || "");
  if (safeLegacyHtml.trim()) return safeLegacyHtml;
  if (parsed?.type === "doc") return sanitizeDocumentHtml(renderJsonNode(parsed) || "<p></p>");
  return "<p></p>";
}
