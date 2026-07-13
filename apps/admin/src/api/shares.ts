/**
 * api/shares.ts
 *
 * 兼容导出层 - 临时保留，逐步迁移到 services/api/
 *
 * ⚠️ 警告：不要再在此文件中添加新逻辑
 * ⚠️ 警告：不要再让新代码 import 本文件
 */

// ============= 类型（保留在原位置） =============

export interface ShareItem {
  id: number;
  shareCode: number;
  customSlug?: string | null;
  isEnabled: boolean;
  reviewStatus?: "pending" | "approved" | "rejected";
  reviewNote?: string | null;
  requestedBy?: number | null;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  hasPassword?: boolean;
  viewCount: number;
  expireAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SharePatch {
  isEnabled?: boolean;
  password?: string | null;
  expireAt?: string | null;
  customSlug?: string | null;
  shareCode?: number | null;
}

export interface ShareReviewItem extends ShareItem {
  docUid: string;
  docTitle: string;
  ownerId?: number | null;
  ownerName?: string | null;
}

// ============= 函数（从 services/api 重导出） =============

export {
  createShareApi,
  getShareByDocApi,
  updateShareApi,
  deleteShareApi,
  listShareReviewsApi,
  reviewShareApi,
  shareApi
} from "@/services/api/share.api";
