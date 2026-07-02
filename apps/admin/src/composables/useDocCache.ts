/**
 * useDocCache.ts - 文档数据 SWR 缓存管理
 *
 * 基于 useSWR 的文档专用缓存，提供：
 * - 文档详情缓存
 * - 文档列表缓存
 * - 乐观更新
 * - 版本冲突检测
 */
import { ref, computed } from "vue";
import { useSWR, type SWROptions } from "./useSWR";
import type { DocDetail, DocSummary } from "../api/docs";

interface DocCacheOptions {
  /** 详情缓存 TTL，默认 2 分钟 */
  detailTtl?: number;
  /** 列表缓存 TTL，默认 1 分钟 */
  listTtl?: number;
  /** 详情缓存最大数量，默认 200 */
  maxDetailCache?: number;
  /** 列表缓存最大数量，默认 100 */
  maxListCache?: number;
}

// 全局缓存统计
const cacheStats = {
  detailHits: 0,
  detailMisses: 0,
  listHits: 0,
  listMisses: 0,
};

/**
 * 文档详情缓存 Hook
 */
export function useDocDetailCache(
  getDoc: () => Promise<{ doc: DocDetail }>,
  options: SWROptions<DocDetail> = {}
) {
  const { ttl = 2 * 60 * 1000, ...rest } = options;

  const swr = useSWR<DocDetail>(
    () => `doc:${getDoc.toString().slice(0, 50)}`,
    async () => {
      const res = await getDoc();
      return res.doc;
    },
    {
      ttl,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      shouldRetryOnError: true,
      maxRetries: 3,
      ...rest,
    }
  );

  return swr;
}

/**
 * 文档列表缓存 Hook
 */
export function useDocListCache(
  getList: () => Promise<{ docs: DocSummary[]; pagination: { page: number; hasMore: boolean } }>,
  options: SWROptions<{ docs: DocSummary[]; pagination: { page: number; hasMore: boolean } }> = {}
) {
  const { ttl = 60 * 1000, ...rest } = options;

  const swr = useSWR<{ docs: DocSummary[]; pagination: { page: number; hasMore: boolean } }>(
    () => `docs:list:${getList.toString().slice(0, 50)}`,
    getList,
    {
      ttl,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      shouldRetryOnError: true,
      maxRetries: 3,
      ...rest,
    }
  );

  return swr;
}

/**
 * 创建文档缓存 key
 */
export function createDocCacheKey(docUid: string): string {
  return `doc:${docUid}`;
}

/**
 * 创建文档列表缓存 key
 */
export function createListCacheKey(query: string, page: number, pageSize: number): string {
  return `docs:list:${query}:${page}:${pageSize}`;
}

/**
 * 获取缓存命中率
 */
export function getCacheHitRate(): { detail: number; list: number } {
  const totalDetail = cacheStats.detailHits + cacheStats.detailMisses;
  const totalList = cacheStats.listHits + cacheStats.listMisses;

  return {
    detail: totalDetail > 0 ? cacheStats.detailHits / totalDetail : 0,
    list: totalList > 0 ? cacheStats.listHits / totalList : 0,
  };
}

/**
 * 重置缓存统计
 */
export function resetCacheStats(): void {
  cacheStats.detailHits = 0;
  cacheStats.detailMisses = 0;
  cacheStats.listHits = 0;
  cacheStats.listMisses = 0;
}

/**
 * 版本冲突检测
 */
export function checkRevisionConflict(
  localRevision: number | undefined,
  serverRevision: number
): { hasConflict: boolean; message?: string } {
  if (localRevision === undefined) {
    return { hasConflict: false };
  }

  if (localRevision < serverRevision) {
    return {
      hasConflict: true,
      message: "文档已被其他人修改，请刷新后重新编辑。",
    };
  }

  if (localRevision > serverRevision) {
    return {
      hasConflict: true,
      message: "本地版本比服务器版本更新，可能存在版本冲突。",
    };
  }

  return { hasConflict: false };
}

/**
 * 乐观更新辅助
 */
export function createOptimisticUpdate<T extends { revision: number }>(
  localData: T,
  patch: Partial<T>
): T {
  return {
    ...localData,
    ...patch,
    revision: localData.revision + 1,
  };
}

/**
 * 缓存预热
 */
export async function warmDocCache(
  docUids: string[],
  fetcher: (uid: string) => Promise<{ doc: DocDetail }>
): Promise<void> {
  const results = await Promise.allSettled(
    docUids.slice(0, 10).map((uid) => fetcher(uid))
  );

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      cacheStats.detailHits++; // 预热不算命中
    }
  });
}
