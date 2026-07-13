import type { SyncState } from "../../../composables/useSyncState";
import type { DocDetail, TocItem } from "../../../features/editor";

export interface MobileVersion {
  id: number;
  title: string;
  wordCount: number;
  authorName: string;
  createdAt: string;
  diffSummary?: string;
}

export interface DocEditorMobileProps {
  current: DocDetail | null;
  loading: boolean;
  error: string;
  title: string;
  saveState: "idle" | "pending" | "saving" | "saved" | "error";
  saveError: string;
  dirty: boolean;
  saving: boolean;
  wordCount: number;
  share: { isEnabled?: boolean; reviewStatus?: string } | null;
  syncState: SyncState;
  docs: Array<{ docUid: string; title: string; updatedAt: string }>;
  docsLoading: boolean;
  versions: MobileVersion[];
  selectedVersion: MobileVersion | null;
  versionPreview: { contentText?: string } | null;
  versionPreviewLoading: boolean;
  sharePanelOpen: boolean;
  shareUrl: string;
  shareEnabled: boolean;
  sharePassword: string;
  shareLoading: boolean;
  shareHasPassword: boolean;
  shareStateText: string;
  shareAccessText: string;
  shareExpiryText: string;
  shareMessage: string;
  shareStatusIsError: boolean;
  shareReviewText: string;
}

export type DocEditorMobileEmits = {
  "update:title": [value: string];
  "editor-change": [payload: { contentJson: string; textLength: number }];
  "toc-update": [toc: TocItem[]];
  "flush-pending-save": [];
  "retry-save": [];
  "create-doc": [];
  "delete-doc": [];
  "copy-share": [];
  "resubmit-share": [];
  "update:shareEnabled": [value: boolean];
  "update:sharePassword": [value: string];
  "update:customSlugInput": [value: string];
  "confirm-password": [];
  "clear-password": [];
  "password-input": [];
  "open-version-preview": [version: MobileVersion];
  "restore-version": [];
  "restore-version-as-copy": [];
  "open-schedule-panel": [];
  "update:mobileSheet": [value: string | null];
  "retry-load-detail": [];
};
