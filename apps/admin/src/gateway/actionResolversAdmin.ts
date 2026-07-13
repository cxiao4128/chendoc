import { actionPayload } from "./actionPayload";
import type { GatewayAction } from "./types";

export function resolveAdminGatewayAction(path: string, method: string, query: Record<string, string>, body: unknown): GatewayAction | null {
  if (method === "GET" && path === "/api/admin/users") return actionPayload("u1");
  const adminUserPromote = path.match(/^\/api\/admin\/users\/(\d+)\/promote$/);
  if (method === "POST" && adminUserPromote) return actionPayload("u3", { params: { id: adminUserPromote[1] } });
  const adminUserDisable = path.match(/^\/api\/admin\/users\/(\d+)\/disable$/);
  if (method === "POST" && adminUserDisable) return actionPayload("u4", { params: { id: adminUserDisable[1] } });
  const adminUserEnable = path.match(/^\/api\/admin\/users\/(\d+)\/enable$/);
  if (method === "POST" && adminUserEnable) return actionPayload("u5", { params: { id: adminUserEnable[1] } });
  const adminUserPassword = path.match(/^\/api\/admin\/users\/(\d+)\/password$/);
  if (method === "GET" && adminUserPassword) return actionPayload("u7", { params: { id: adminUserPassword[1] } });
  if (method === "POST" && adminUserPassword) return actionPayload("u8", { params: { id: adminUserPassword[1] }, body });
  const adminUser = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (method === "GET" && adminUser) return actionPayload("u2", { params: { id: adminUser[1] } });
  if (method === "DELETE" && adminUser) return actionPayload("u6", { params: { id: adminUser[1] } });

  if (method === "GET" && path === "/api/uploads/policy") return actionPayload("f1");
  if (method === "POST" && path === "/api/uploads/presign") return actionPayload("f2", { body });
  if (method === "POST" && path === "/api/uploads/complete") return actionPayload("f3", { body });
  const upload = path.match(/^\/api\/uploads\/(\d+)$/);
  if (method === "DELETE" && upload) return actionPayload("f4", { params: { id: upload[1] } });

  if (method === "GET" && path === "/api/spaces") return actionPayload("w1");
  if (method === "POST" && path === "/api/spaces") return actionPayload("w2", { body });
  const space = path.match(/^\/api\/spaces\/(\d+)$/);
  if (method === "PATCH" && space) return actionPayload("w3", { params: { id: space[1] }, body });
  if (method === "DELETE" && space) return actionPayload("w4", { params: { id: space[1] } });

  if (method === "GET" && path === "/api/forms") return actionPayload("fm1");
  if (method === "POST" && path === "/api/forms") return actionPayload("fm2", { body });
  const formDetail = path.match(/^\/api\/forms\/(\d+)$/);
  if (method === "GET" && formDetail) return actionPayload("fm3", { params: { id: formDetail[1] } });
  if (method === "PUT" && formDetail) return actionPayload("fm4", { params: { id: formDetail[1] }, body });
  if (method === "DELETE" && formDetail) return actionPayload("fm5", { params: { id: formDetail[1] } });
  const formPublish = path.match(/^\/api\/forms\/(\d+)\/publish$/);
  if (method === "POST" && formPublish) return actionPayload("fm6", { params: { id: formPublish[1] }, body });
  const formSubmissions = path.match(/^\/api\/forms\/(\d+)\/submissions$/);
  if (method === "GET" && formSubmissions) return actionPayload("fm7", { params: { id: formSubmissions[1] }, query });
  if (method === "DELETE" && formSubmissions) return actionPayload("fm10", { params: { id: formSubmissions[1] } });
  const formSubmission = path.match(/^\/api\/forms\/(\d+)\/submissions\/(\d+)$/);
  if (method === "DELETE" && formSubmission) return actionPayload("fm11", { params: { id: formSubmission[1], submissionId: formSubmission[2] } });
  const formExport = path.match(/^\/api\/forms\/(\d+)\/export$/);
  if (method === "GET" && formExport) return actionPayload("fm8", { params: { id: formExport[1] }, query });
  const formIpStats = path.match(/^\/api\/forms\/(\d+)\/ip-stats$/);
  if (method === "GET" && formIpStats) return actionPayload("fm9", { params: { id: formIpStats[1] } });

  if (method === "GET" && path === "/api/admin/invites") return actionPayload("i1");
  if (method === "POST" && path === "/api/admin/invites") return actionPayload("i2", { body });
  if (method === "POST" && path === "/api/admin/invites/batch") return actionPayload("i3", { body });
  const inviteDisable = path.match(/^\/api\/admin\/invites\/(\d+)\/disable$/);
  if (method === "PATCH" && inviteDisable) return actionPayload("i4", { params: { id: inviteDisable[1] } });
  const invite = path.match(/^\/api\/admin\/invites\/(\d+)$/);
  if (method === "DELETE" && invite) return actionPayload("i5", { params: { id: invite[1] } });

  const dangerDoc = path.match(/^\/api\/admin\/docs\/by-uid\/([A-Za-z0-9]{16,32})$/);
  if (method === "GET" && dangerDoc) return actionPayload("x1", { params: { docUid: dangerDoc[1] } });
  if (method === "DELETE" && dangerDoc) return actionPayload("x2", { params: { docUid: dangerDoc[1] } });

  if (method === "GET" && path === "/api/admin/security/totp/status") return actionPayload("y1");
  if (method === "POST" && path === "/api/admin/security/totp/setup") return actionPayload("y2");
  if (method === "POST" && path === "/api/admin/security/totp/enable") return actionPayload("y3", { body });
  if (method === "POST" && path === "/api/admin/security/totp/disable") return actionPayload("y4", { body });
  if (method === "POST" && path === "/api/admin/security/totp/recovery-codes") return actionPayload("y6", { body });
  if (method === "POST" && path === "/api/admin/security/totp/reset") return actionPayload("y7", { body });
  if (method === "POST" && (path === "/api/admin/security/danger-verify" || path === "/api/security/danger-verify")) return actionPayload("y8", { body });

  const docComments = path.match(/^\/api\/docs\/([A-Za-z0-9]{16,32})\/comments$/);
  if (method === "GET" && docComments) return actionPayload("m1", { target: "docComments", params: { docUid: docComments[1] } });
  if (method === "POST" && docComments) return actionPayload("m1", { target: "createComment", params: { docUid: docComments[1] }, body });
  const commentReactions = path.match(/^\/api\/comments\/(\d+)\/reactions$/);
  if (method === "POST" && commentReactions) return actionPayload("m1", { target: "commentReaction", params: { id: commentReactions[1] }, body });
  const comment = path.match(/^\/api\/comments\/(\d+)$/);
  if (method === "PATCH" && comment) return actionPayload("m1", { target: "updateComment", params: { id: comment[1] }, body });
  if (method === "DELETE" && comment) return actionPayload("m1", { target: "deleteComment", params: { id: comment[1] } });
  if (method === "GET" && path === "/api/admin/comments") return actionPayload("m1", { target: "adminComments", query });
  if (method === "POST" && path === "/api/admin/comments/batch-delete") return actionPayload("m1", { target: "adminBatchDelete", body });
  const adminComment = path.match(/^\/api\/admin\/comments\/(\d+)$/);
  if (method === "DELETE" && adminComment) return actionPayload("m1", { target: "adminDelete", params: { id: adminComment[1] } });

  if (method === "POST" && path === "/api/stats/track") return actionPayload("v1", { target: "track", body });
  const recentStats = path.match(/^\/api\/stats\/(doc|form)\/(\d+)\/recent$/);
  if (method === "GET" && recentStats) return actionPayload("v1", { target: "recent", params: { type: recentStats[1], id: recentStats[2] }, query });
  const stats = path.match(/^\/api\/stats\/(doc|form)\/(\d+)$/);
  if (method === "GET" && stats) return actionPayload("v1", { target: "stats", params: { type: stats[1], id: stats[2] }, query });

  if (method === "GET" && path === "/api/tags/tree") return actionPayload("t1", { target: "tree" });
  if (method === "GET" && path === "/api/tags/stats") return actionPayload("t1", { target: "stats" });
  if (method === "GET" && path === "/api/tags/colors") return actionPayload("t1", { target: "colors" });
  if (method === "GET" && path === "/api/tags") return actionPayload("t1", { target: "list" });
  if (method === "POST" && path === "/api/tags") return actionPayload("t1", { target: "create", body });
  if (method === "POST" && path === "/api/tags/merge") return actionPayload("t1", { target: "merge", body });
  if (method === "POST" && path === "/api/tags/docs/add") return actionPayload("t1", { target: "addDocs", body });
  if (method === "POST" && path === "/api/tags/docs/remove") return actionPayload("t1", { target: "removeDocs", body });
  const tagRename = path.match(/^\/api\/tags\/(\d+)\/rename$/);
  if (method === "POST" && tagRename) return actionPayload("t1", { target: "rename", params: { id: tagRename[1] }, body });
  const tag = path.match(/^\/api\/tags\/(\d+)$/);
  if (method === "GET" && tag) return actionPayload("t1", { target: "detail", params: { id: tag[1] } });
  if (method === "PATCH" && tag) return actionPayload("t1", { target: "update", params: { id: tag[1] }, body });
  if (method === "DELETE" && tag) return actionPayload("t1", { target: "delete", params: { id: tag[1] } });

  if (method === "GET" && path === "/api/templates/builtin") return actionPayload("k1", { target: "builtin" });
  if (method === "GET" && path === "/api/templates") return actionPayload("k1", { target: "list" });
  if (method === "POST" && path === "/api/templates") return actionPayload("k1", { target: "create", body });
  const template = path.match(/^\/api\/templates\/(\d+)$/);
  if (method === "GET" && template) return actionPayload("k1", { target: "detail", params: { id: template[1] } });
  if (method === "PATCH" && template) return actionPayload("k1", { target: "update", params: { id: template[1] }, body });
  if (method === "DELETE" && template) return actionPayload("k1", { target: "delete", params: { id: template[1] } });
  return null;
}
