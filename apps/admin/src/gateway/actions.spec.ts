import { describe, expect, test } from "vitest";
import { resolveGatewayAction } from "./actions";

const DOC_UID = "Abcdefghijklmnop";

describe("gateway endpoint coverage", () => {
  test.each([
    ["/api/docs/search/quick?q=a", "GET", "q1"],
    ["/api/docs/search/suggestions?q=a", "GET", "q1"],
    ["/api/docs/search/history?page=1", "GET", "q1"],
    ["/api/docs/search/history", "DELETE", "q1"],
    ["/api/docs/search/history/1", "DELETE", "q1"],
    [`/api/docs/${DOC_UID}/schedule`, "GET", "j1"],
    [`/api/docs/${DOC_UID}/schedule`, "PUT", "j1"],
    [`/api/docs/${DOC_UID}/schedule`, "DELETE", "j1"],
    [`/api/docs/${DOC_UID}/versions/1`, "GET", "j1"],
    [`/api/docs/${DOC_UID}/versions/1/restore-copy`, "POST", "j1"],
    [`/api/docs/${DOC_UID}/comments`, "GET", "m1"],
    [`/api/docs/${DOC_UID}/comments`, "POST", "m1"],
    ["/api/comments/1", "PATCH", "m1"],
    ["/api/comments/1", "DELETE", "m1"],
    ["/api/comments/1/reactions", "POST", "m1"],
    ["/api/admin/comments?page=1", "GET", "m1"],
    ["/api/admin/comments/1", "DELETE", "m1"],
    ["/api/admin/comments/batch-delete", "POST", "m1"],
    ["/api/stats/doc/1?days=30", "GET", "v1"],
    ["/api/stats/form/1/recent?limit=10", "GET", "v1"],
    ["/api/stats/track", "POST", "v1"],
    ["/api/tags/tree", "GET", "t1"],
    ["/api/tags/stats", "GET", "t1"],
    ["/api/tags/colors", "GET", "t1"],
    ["/api/tags", "GET", "t1"],
    ["/api/tags", "POST", "t1"],
    ["/api/tags/1", "GET", "t1"],
    ["/api/tags/1", "PATCH", "t1"],
    ["/api/tags/1", "DELETE", "t1"],
    ["/api/tags/1/rename", "POST", "t1"],
    ["/api/tags/merge", "POST", "t1"],
    ["/api/tags/docs/add", "POST", "t1"],
    ["/api/tags/docs/remove", "POST", "t1"],
    ["/api/templates/builtin", "GET", "k1"],
    ["/api/templates", "GET", "k1"],
    ["/api/templates", "POST", "k1"],
    ["/api/templates/1", "GET", "k1"],
    ["/api/templates/1", "PATCH", "k1"],
    ["/api/templates/1", "DELETE", "k1"],
  ])("%s %s maps to %s", (url, method, expectedAction) => {
    expect(resolveGatewayAction(url, method, {})).toMatchObject({ action: expectedAction });
  });
});
