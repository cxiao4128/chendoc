export type DocumentAction =
  | "list"
  | "read"
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "permanent_delete"
  | "history"
  | "share"
  | "search"
  | "batch";

export type DocumentActor = {
  id: number;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
};

export type DocumentAccessRecord = {
  ownerId: number | null;
  isSuperAdminDoc: boolean | number;
};

function isSuperAdminDoc(document: DocumentAccessRecord) {
  return document.isSuperAdminDoc === true || document.isSuperAdminDoc === 1;
}

export function canAccessDocument(
  user: DocumentActor | undefined,
  document: DocumentAccessRecord | undefined,
  action: DocumentAction
) {
  if (action === "create") return !!user;
  if (!user || !document) return false;
  if (user.isSuperAdmin) return true;
  if (isSuperAdminDoc(document)) return false;
  return document.ownerId === user.id;
}
