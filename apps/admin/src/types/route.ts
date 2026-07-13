export type WorkspaceScope = "admin" | "users" | "public";

export interface RouteTab {
  key: string;
  label: string;
  path: string;
  requiresSuperAdmin?: boolean;
}
