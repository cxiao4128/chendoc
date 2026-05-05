import { request } from "./request";

export function listSpacesApi() {
  return request<{ spaces: Array<{ id: number; name: string; description?: string | null }> }>("/api/spaces");
}
