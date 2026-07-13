import { actionPayload } from "./actionPayload";
import type { GatewayAction } from "./types";

export function resolveCoreGatewayAction(path: string, method: string, query: Record<string, string>, body: unknown): GatewayAction | null {
  if (method === "POST" && path === "/api/auth/login") return actionPayload("a1", { body });
  if (method === "POST" && path === "/api/auth/register") return actionPayload("a2", { body });
  if ((method === "POST" || method === "GET") && path === "/api/auth/me") return actionPayload("a3");
  if (method === "POST" && path === "/api/auth/change-password") return actionPayload("a4", { body });
  if (method === "POST" && path === "/api/auth/refresh") return actionPayload("a5");
  if (method === "POST" && path === "/api/auth/logout") return actionPayload("a6");
  if (method === "GET" && path === "/api/captcha") return actionPayload("c1");
  if (method === "GET" && path === "/api/public/settings/site") return actionPayload("p1");

  const publicSharePassword = path.match(/^\/api\/public\/r\/([^/]+)\/verify-password$/);
  if (method === "POST" && publicSharePassword) {
    return actionPayload("p2", { params: { shareKey: decodeURIComponent(publicSharePassword[1]) }, body });
  }
  const publicShare = path.match(/^\/api\/public\/r\/([^/]+)$/);
  if (method === "GET" && publicShare) return actionPayload("p3", { params: { shareKey: decodeURIComponent(publicShare[1]) } });

  if (method === "GET" && path === "/api/docs") return actionPayload("d1", { query });
  if (method === "GET" && path === "/api/docs/search") return actionPayload("d1", { query, mode: "search" });
  if (method === "GET" && path === "/api/docs/search/quick") return actionPayload("q1", { target: "quick", query });
  if (method === "GET" && path === "/api/docs/search/suggestions") return actionPayload("q1", { target: "suggestions", query });
  if (method === "GET" && path === "/api/docs/search/history") return actionPayload("q1", { target: "history", query });
  if (method === "DELETE" && path === "/api/docs/search/history") return actionPayload("q1", { target: "clearHistory" });
  const searchHistoryItem = path.match(/^\/api\/docs\/search\/history\/(\d+)$/);
  if (method === "DELETE" && searchHistoryItem) return actionPayload("q1", { target: "deleteHistory", params: { id: searchHistoryItem[1] } });
  if (method === "POST" && path === "/api/docs") return actionPayload("d3", { body });
  if (method === "POST" && path === "/api/docs/bulk-delete") return actionPayload("d5", { body });
  if (method === "GET" && path === "/api/export/content") return actionPayload("e1", { query });
  if (method === "POST" && path === "/api/export/docs") return actionPayload("e2", { query, body });

  const exportDoc = path.match(/^\/api\/export\/doc\/(\d+)$/);
  if (method === "GET" && exportDoc) return actionPayload("e3", { params: { docId: exportDoc[1] }, query });
  if (method === "GET" && path === "/api/docs/trash") return actionPayload("r1", { query });
  if (method === "POST" && path === "/api/docs/trash/batch-restore") return actionPayload("r2", { body });
  if (method === "POST" && path === "/api/docs/trash/batch-delete") return actionPayload("r3", { body });
  if (method === "GET" && path === "/api/docs/trash/stats") return actionPayload("r4", {});
  if (method === "GET" && path === "/api/admin/docs/trash") return actionPayload("r1", { query, scope: "admin" });
  if (method === "POST" && path === "/api/admin/docs/trash/bulk-restore") return actionPayload("r2", { body, scope: "admin" });
  if (method === "POST" && path === "/api/admin/docs/trash/bulk-hard-delete") return actionPayload("r3", { body, scope: "admin" });

  const docVersionRestore = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/versions\/(\d+)\/restore$/);
  if (method === "POST" && docVersionRestore) {
    return actionPayload("d8", { params: { docUid: docVersionRestore[1], versionId: docVersionRestore[2] } });
  }
  const docVersionCopy = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/versions\/(\d+)\/restore-copy$/);
  if (method === "POST" && docVersionCopy) {
    return actionPayload("j1", { target: "restoreCopy", params: { docUid: docVersionCopy[1], versionId: docVersionCopy[2] } });
  }
  const docVersionPreview = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/versions\/(\d+)$/);
  if (method === "GET" && docVersionPreview) {
    return actionPayload("j1", { target: "versionPreview", params: { docUid: docVersionPreview[1], versionId: docVersionPreview[2] } });
  }
  const docVersions = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/versions$/);
  if (method === "GET" && docVersions) return actionPayload("d7", { params: { docUid: docVersions[1] } });
  const docSchedule = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/schedule$/);
  if (method === "GET" && docSchedule) return actionPayload("j1", { target: "getSchedule", params: { docUid: docSchedule[1] } });
  if (method === "PUT" && docSchedule) return actionPayload("j1", { target: "setSchedule", params: { docUid: docSchedule[1] }, body });
  if (method === "DELETE" && docSchedule) return actionPayload("j1", { target: "deleteSchedule", params: { docUid: docSchedule[1] } });
  const docPublish = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/publish$/);
  if (method === "POST" && docPublish) return actionPayload("d6", { params: { docUid: docPublish[1] } });
  const docShare = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/share$/);
  if (method === "POST" && docShare) return actionPayload("h1", { params: { docUid: docShare[1] }, body });
  const docDetail = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})$/);
  if (method === "GET" && docDetail) return actionPayload("d2", { params: { docUid: docDetail[1] } });
  if (method === "PATCH" && docDetail) return actionPayload("d3", { params: { docUid: docDetail[1] }, body });
  if (method === "DELETE" && docDetail) return actionPayload("d4", { params: { docUid: docDetail[1] } });

  const shareByDoc = path.match(/^\/api\/shares\/doc\/([A-Za-z0-9]{16,32})$/);
  if (method === "GET" && shareByDoc) return actionPayload("h2", { params: { docUid: shareByDoc[1] } });
  const shareReview = path.match(/^\/api\/admin\/share-reviews\/(\d+)\/review$/);
  if (method === "POST" && shareReview) return actionPayload("h6", { params: { id: shareReview[1] }, body });
  if (method === "GET" && path === "/api/admin/share-reviews") return actionPayload("h5");
  const shareDetail = path.match(/^\/api\/shares\/(\d+)$/);
  if (method === "PATCH" && shareDetail) return actionPayload("h3", { params: { id: shareDetail[1] }, body });
  if (method === "DELETE" && shareDetail) return actionPayload("h4", { params: { id: shareDetail[1] } });

  if (method === "GET" && path === "/api/settings") return actionPayload("s1", { target: "settings" });
  if (method === "PATCH" && path === "/api/settings") return actionPayload("s2", { target: "settings", body });
  if (method === "GET" && path === "/api/settings/site") return actionPayload("s1", { target: "site" });
  if (method === "POST" && path === "/api/settings/site") return actionPayload("s2", { target: "site", body });
  if (method === "GET" && path === "/api/settings/storage/r2") return actionPayload("s1", { target: "r2" });
  if (method === "POST" && path === "/api/settings/storage/r2") return actionPayload("s2", { target: "r2", body });
  if (method === "POST" && path === "/api/settings/storage/r2/test") return actionPayload("s2", { target: "r2Test", body });
  if (method === "GET" && path === "/api/settings/operation-logs") return actionPayload("s1", { target: "logs" });
  if (method === "GET" && path === "/api/settings/system/status") return actionPayload("s1", { target: "systemStatus" });
  if (method === "GET" && path === "/api/settings/system/export") return actionPayload("s1", { target: "systemExport" });
  const systemAction = path.match(/^\/api\/settings\/system\/actions\/([^/]+)$/);
  if (method === "POST" && systemAction) return actionPayload("s2", { target: "systemAction", params: { action: decodeURIComponent(systemAction[1]) } });
  return null;
}
