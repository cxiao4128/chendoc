/**
 * features/documents/hooks/useDocumentStats.ts - 文档统计 Hook
 *
 * 重构说明：
 * - 从 DocListPage.vue 抽离统计计算逻辑
 * - 计算文档总数、已发布、已分享、审批中、草稿、未分享数量
 * - 聚合标签列表
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { getSystemStatusApi, listManagedUsersApi, listOperationLogsApi, type SystemStatusView } from "@/services/api";
import { listSpacesApi } from "../../../api/spaces";
import { useAuthStore } from "../../../stores/auth";
import { useWorkspaceRoutes } from "../../../composables/useWorkspaceRoutes";
import type { DocSummary } from "@/services/api";
import type { DocumentStats, StorageOverview, ActivityLog } from "../types";
import { shareKeyOf, sharePathOf } from "../../../utils/sharePath";

// ============= 导出 Hook =============
export function useDocumentStats() {
  const auth = useAuthStore();
  const { docPath } = useWorkspaceRoutes();
  const router = useRouter();

  // ============= 状态 =============

  /** 系统状态（API 返回 { status: SystemStatusView }） */
  const systemStatus = ref<SystemStatusView | null>(null);

  /** 管理的用户数 */
  const managedUserCount = ref(1);

  /** 最近活动 */
  const recentActivity = ref<ActivityLog[]>([]);

  /** 空间列表 */
  const spaces = ref<Array<{ id: number; name: string }>>([]);

  // ============= 计算属性 =============

  /** 存储概览 */
  const storageOverview = computed<StorageOverview>(() => ({
    totalBytes: systemStatus.value?.storage?.totalBytes || 0,
    fileCount: systemStatus.value?.storage?.fileCount || 0,
  }));

  /** 是否能访问管理后台 */
  const canAccessAdmin = computed(() => auth.canAccessAdmin);

  /** 所有者名称 */
  const ownerName = computed(() => auth.user?.username || "xchen");

  // ============= 方法 =============

  /** 格式化字节数 */
  function formatBytes(value = 0): string {
    if (value < 1024) return `${value} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let size = value / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
  }

  /** 解析文档标签 */
  function docTags(doc: { tags?: string[] | string | null }): string[] {
    if (Array.isArray(doc.tags)) return doc.tags;
    if (typeof doc.tags !== "string") return [];
    try { return JSON.parse(doc.tags) as string[]; } catch { return []; }
  }

  /** 计算文档统计（单次遍历） */
  function computeStats(docs: DocSummary[]): DocumentStats {
    let published = 0, shared = 0, review = 0, draft = 0, unshared = 0;
    const tags = new Set<string>();
    for (const doc of docs) {
      if (doc.status === "published") published++;
      else draft++;
      if (doc.shareCode && doc.shareEnabled) shared++;
      else unshared++;
      if (doc.shareReviewStatus === "pending") review++;
      docTags(doc).forEach(t => tags.add(t));
    }
    return {
      total: docs.length,
      published, shared, review, draft, unshared,
      availableTags: Array.from(tags).sort((a, b) => a.localeCompare(b, "zh-CN")),
    };
  }

  /** 活动日志文案 */
  function activityText(log: ActivityLog): string {
    if (log.action === "doc.create") return "新建文档";
    if (log.action.includes("restore")) return "恢复文档";
    if (log.action.includes("delete")) return "删除文档";
    if (log.action.includes("publish")) return "发布文档";
    if (log.action.startsWith("share.")) return "更新分享";
    return "更新文档";
  }

  /** 打开活动日志对应的文档 */
  function openActivity(log: ActivityLog) {
    if (log.targetType === "doc" && /^[A-Za-z0-9_-]{16,32}$/.test(log.targetId)) {
      router.push(docPath(log.targetId));
    }
  }

  /** 分享状态文本 */
  function shareStatusText(doc: { status?: string; shareCode?: number | null; customSlug?: string | null; shareEnabled?: boolean | null; shareReviewStatus?: string | null }): string {
    const key = shareKeyOf(doc);
    if (doc.status !== "published") return "草稿";
    if (!key) return "已发布 · 未公开";
    if (doc.shareReviewStatus === "pending") return `已发布 → 待审核 · ${key}`;
    if (doc.shareReviewStatus === "rejected") return `已发布 → 已拒绝 · ${key}`;
    if (doc.shareEnabled) return `已发布 → 已公开 · ${key}`;
    return `已发布 → 已关闭 · ${key}`;
  }

  /** 状态文本 */
  function statusText(status: string): string {
    return status === "published" ? "已发布" : "草稿";
  }

  /** 格式化日期 */
  function formatDate(value: string): string {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(new Date(value));
  }

  /** 分享路径 */
  function sharePath(doc: { shareCode?: number | null; customSlug?: string | null }): string {
    return sharePathOf(doc) || "未分享";
  }

  // ============= 加载系统状态 =============

  /** 加载系统状态和活动日志 */
  async function loadSystemStatus() {
    const [statusResult, logsResult, usersResult, spacesResult] = await Promise.allSettled([
      canAccessAdmin.value ? getSystemStatusApi() : Promise.resolve(null),
      canAccessAdmin.value ? listOperationLogsApi() : Promise.resolve(null),
      canAccessAdmin.value ? listManagedUsersApi() : Promise.resolve({ users: [auth.user] }),
      listSpacesApi()
    ]);
    systemStatus.value = statusResult.status === "fulfilled" && statusResult.value ? statusResult.value.status ?? null : null;
    recentActivity.value = logsResult.status === "fulfilled" ? logsResult.value?.logs.slice(0, 5) ?? [] : [];
    managedUserCount.value = usersResult.status === "fulfilled" ? usersResult.value.users.length : 1;
    spaces.value = spacesResult.status === "fulfilled" ? spacesResult.value.spaces : [];
  }

  return {
    // 状态
    systemStatus,
    managedUserCount,
    recentActivity,
    spaces,

    // 计算属性
    storageOverview,
    canAccessAdmin,
    ownerName,

    // 方法
    formatBytes,
    docTags,
    computeStats,
    activityText,
    openActivity,
    shareStatusText,
    statusText,
    formatDate,
    sharePath,

    // 加载
    loadSystemStatus,
  };
}
