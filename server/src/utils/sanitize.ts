import sanitizeHtml from "sanitize-html";

export function sanitizeDocumentHtml(input: string) {
  return sanitizeHtml(input, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "video",
      "source",
      "figure",
      "figcaption",
      "span",
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
      video: ["src", "controls", "preload", "poster", "width", "height"],
      source: ["src", "type"],
      input: ["type", "checked", "disabled"],
      ul: ["data-type"],
      li: ["data-type"],
      "*": ["class"]
    },
    allowedStyles: {
      span: {
        "font-family": [/^[-,"'\w\s]+(?:,\s*[-,"'\w\s]+)*$/]
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
