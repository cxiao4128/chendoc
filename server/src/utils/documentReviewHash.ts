import { createHash } from "node:crypto";

export function documentReviewHash(doc: { title: string; contentJson: string; contentHtml: string }) {
  return createHash("sha256")
    .update(doc.title)
    .update("\0")
    .update(doc.contentJson)
    .update("\0")
    .update(doc.contentHtml)
    .digest("hex");
}
