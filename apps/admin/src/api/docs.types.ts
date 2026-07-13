export interface DocSummary {
  docUid: string;
  spaceId: number | null;
  parentId: number | null;
  title: string;
  summary?: string | null;
  tags?: string[] | string | null;
  status: "draft" | "published" | "archived";
  pinned?: boolean;
  sort: number;
  createdBy?: number | null;
  updatedBy?: number | null;
  ownerId?: number | null;
  ownerRole?: "user" | "doc_admin" | "super_admin";
  scope?: "user" | "admin" | "system";
  isSuperAdminDoc?: boolean;
  visibility?: "private" | "shared" | "public";
  tenantKey?: string;
  ownerUsername?: string | null;
  updatedAt: string;
  createdAt: string;
  deletedAt?: string | null;
  deletedBy?: number | null;
  revision: number;
  shareCode?: number | null;
  customSlug?: string | null;
  shareEnabled?: boolean | null;
  shareReviewStatus?: "pending" | "approved" | "rejected" | null;
}

export interface DocDetail extends DocSummary {
  contentJson: string;
  contentHtml: string;
  coverUrl?: string | null;
  summary?: string | null;
  tags?: string[] | string | null;
  share?: Record<string, unknown> | null;
  scheduledAt?: string | null;
  expiresAt?: string | null;
  autoArchive?: boolean;
}

export type DocUpdateInput = Partial<
  Pick<DocDetail, "title" | "contentJson" | "contentHtml" | "coverUrl" | "summary" | "tags" | "pinned" | "status" | "sort">
> & {
  expectedRevision?: number;
};

export interface DocVersion {
  id: number;
  title: string;
  wordCount: number;
  authorName: string;
  diffSummary: string;
  createdBy?: number | null;
  createdAt: string;
}

export interface DocVersionPreview {
  id: number;
  title: string;
  contentText: string;
  wordCount: number;
  createdBy?: number | null;
  createdAt: string;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SearchOptions {
  q: string;
  page?: number;
  pageSize?: number;
  sort?: "relevance" | "updatedAt" | "createdAt" | "viewCount";
  sortOrder?: "asc" | "desc";
  includeHighlights?: boolean;
  status?: "draft" | "published" | "archived";
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface TrashStats {
  trashCount: number;
  storageUsedBytes: number;
  storageTotalBytes: number;
  oldestDeletedAt: string | null;
  oldestDeletedDocUid: string | null;
  oldestDeletedTitle: string | null;
  retentionDays: number;
}

export interface DocSchedule {
  scheduledAt: string | null;
  expiresAt: string | null;
  autoArchive: boolean;
}

export interface SetScheduleInput {
  scheduledAt?: string | null;
  expiresAt?: string | null;
  autoArchive?: boolean;
}

export type ExportFormat = "markdown" | "html" | "json";

export interface ExportedDoc {
  docUid: string;
  title: string;
  content: string;
  fileName: string;
}

export interface BatchExportResult {
  documents: ExportedDoc[];
}
