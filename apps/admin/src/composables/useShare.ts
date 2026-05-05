import { createShareApi, getShareByDocApi } from "../api/shares";

export function useShare() {
  async function ensureShare(docId: number) {
    const existing = await getShareByDocApi(docId);
    if (existing.share) return existing.share;
    const created = await createShareApi(docId);
    return created.share;
  }

  return { ensureShare };
}
