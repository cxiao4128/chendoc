import { endpoints } from "./endpoints";

export interface PublicKeyResponse {
  keyId: string;
  publicKey: string;
}

export async function fetchPublicKey() {
  const response = await fetch(endpoints.publicKey);
  if (!response.ok) {
    throw new Error("Failed to load crypto public key");
  }
  return await response.json() as PublicKeyResponse;
}
