/**
 * useDocEditorContext.ts - 文档编辑器上下文单例
 *
 * 这是一个模块级单例，在 DocEditorShell 中初始化，DocEditorPage 注入使用。
 * 所有状态都是 Ref，脚本中使用 .value 访问，模板中自动解包。
 */
import { ref, type Ref } from "vue";

// 类型定义
export interface DocEditorContext {
  // 基础信息
  docUid: Ref<string>;
  current: Ref<any>;
  loading: Ref<boolean>;
  error: Ref<string>;

  // 文档内容
  title: Ref<string>;
  draft: Ref<any>;
  dirty: Ref<boolean>;
  saveState: Ref<string>;
  saveError: Ref<string>;
  documentWordCount: Ref<number>;

  // 分享
  share: Ref<any>;
  shareLoading: Ref<boolean>;
  shareEnabled: Ref<boolean>;
  sharePassword: Ref<string>;
  shareCodeInput: Ref<string>;
  customSlugInput: Ref<string>;
  shareStatus: Ref<string>;
  shareHasPassword: Ref<boolean>;

  // 版本
  versions: Ref<any[]>;
  selectedVersion: Ref<any>;
  versionPreview: Ref<any>;
  versionPreviewLoading: Ref<boolean>;

  // 目录
  toc: Ref<any[]>;

  // UI 状态
  showDesktopLeft: Ref<boolean>;
  showDesktopDocTree: Ref<boolean>;
  sharePanelOpen: Ref<boolean>;
  commentPanelOpen: Ref<boolean>;
  schedulePanelOpen: Ref<boolean>;
  sync: any; // SyncState composable 返回的对象

  // 方法（会在 DocEditorShell 中被替换）
  onEditorChange: (payload: any) => void;
  retryLoadDetail: () => void;
  save: () => Promise<void>;
  flushPendingSave: () => Promise<void>;
  retrySave: () => void;

  // 共享状态
  auth: any;
  docs: any;
}

// 模块级单例
const context: DocEditorContext = {
  // 基础信息
  docUid: ref(""),
  current: ref(null),
  loading: ref(false),
  error: ref(""),

  // 文档内容
  title: ref(""),
  draft: ref(null),
  dirty: ref(false),
  saveState: ref("idle"),
  saveError: ref(""),
  documentWordCount: ref(0),

  // 分享
  share: ref(null),
  shareLoading: ref(false),
  shareEnabled: ref(false),
  sharePassword: ref(""),
  shareCodeInput: ref(""),
  customSlugInput: ref(""),
  shareStatus: ref(""),
  shareHasPassword: ref(false),

  // 版本
  versions: ref([]),
  selectedVersion: ref(null),
  versionPreview: ref(null),
  versionPreviewLoading: ref(false),

  // 目录
  toc: ref([]),

  // UI 状态
  showDesktopLeft: ref(true),
  showDesktopDocTree: ref(true),
  sharePanelOpen: ref(false),
  commentPanelOpen: ref(false),
  schedulePanelOpen: ref(false),
  sync: null,

  // 方法
  onEditorChange: () => {},
  retryLoadDetail: () => {},
  save: async () => {},
  flushPendingSave: async () => {},
  retrySave: () => {},

  // 共享状态
  auth: null,
  docs: null,
};

export function useDocEditorContext(): DocEditorContext {
  return context;
}

// 重置上下文（切换文档时调用）
export function resetDocEditorContext() {
  context.docUid.value = "";
  context.current.value = null;
  context.loading.value = false;
  context.error.value = "";
  context.title.value = "";
  context.draft.value = null;
  context.dirty.value = false;
  context.saveState.value = "idle";
  context.saveError.value = "";
  context.documentWordCount.value = 0;
  context.share.value = null;
  context.shareLoading.value = false;
  context.shareEnabled.value = false;
  context.sharePassword.value = "";
  context.shareCodeInput.value = "";
  context.customSlugInput.value = "";
  context.shareStatus.value = "";
  context.shareHasPassword.value = false;
  context.versions.value = [];
  context.selectedVersion.value = null;
  context.versionPreview.value = null;
  context.versionPreviewLoading.value = false;
  context.toc.value = [];
  context.sync = null;
}
