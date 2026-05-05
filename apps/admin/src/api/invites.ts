import { request } from "./request";

export interface InviteItem {
  id: number;
  code: string;
  status: "unused" | "used" | "disabled" | "expired";
  usedByUsername?: string | null;
  usedAt?: string | null;
  expireAt?: string | null;
  createdAt: string;
}

export function listInvitesApi() {
  return request<{ invites: InviteItem[] }>("/api/admin/invites");
}

export function createInviteApi(expireAt?: string) {
  return request<{ invite: { id: number; code: string } }>("/api/admin/invites", {
    method: "POST",
    body: JSON.stringify({ expireAt: expireAt || null })
  });
}

export function createInviteBatchApi(count: number, expireAt?: string) {
  return request<{ invites: Array<{ id: number; code: string }> }>("/api/admin/invites/batch", {
    method: "POST",
    body: JSON.stringify({ count, expireAt: expireAt || null })
  });
}

export function disableInviteApi(id: number) {
  return request<{ ok: true }>(`/api/admin/invites/${id}/disable`, { method: "PATCH" });
}

export function deleteInviteApi(id: number) {
  return request<{ ok: true }>(`/api/admin/invites/${id}`, { method: "DELETE" });
}
