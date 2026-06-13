import { createShareApi, getShareByDocApi } from "../api/shares";

export function useShare() {
  async function ensureShare(docUid: string) {
    const existing = await getShareByDocApi(docUid);
    if (existing.share) return existing.share;
    const created = await createShareApi(docUid);
    return created.share;
  }

  return { ensureShare };
}
