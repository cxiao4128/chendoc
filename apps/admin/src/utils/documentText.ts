type ContentNode = {
  text?: unknown;
  content?: unknown;
};

function collectText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const value = node as ContentNode;
  const ownText = typeof value.text === "string" ? value.text : "";
  const childText = Array.isArray(value.content)
    ? value.content.map(collectText).join("")
    : "";
  return ownText + childText;
}

export function textLengthFromContentJson(contentJson: string): number {
  try {
    return collectText(JSON.parse(contentJson || "{}")).replace(/\s+/g, "").length;
  } catch {
    return 0;
  }
}
