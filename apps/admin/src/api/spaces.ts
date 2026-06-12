import { request } from "./request";

export function listSpacesApi() {
  return request<{ spaces: Array<{ id: number; name: string; description?: string | null }> }>("/api/spaces");
}

export function createSpaceApi(input: { name: string; description?: string | null }) {
  return request<{ id: number }>("/api/spaces", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
