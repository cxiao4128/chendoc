<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch, type Component } from "vue";
import { onBeforeRouteLeave, useRouter, useRoute } from "vue-router";
import {
  ArrowLeft, Check, Edit3,
  Search, Plus, Trash2, Send, Copy, GripVertical,
  ChevronUp, ChevronDown, X, ImageIcon, Calendar, List, FileText,
  Phone, Mail, User, MapPin, CreditCard, CircleDot, CheckSquare,
  Square, Type as TextIcon, Hash, Star as RatingIcon,
  Upload, MapPinned, PenTool, Grid3X3, SlidersHorizontal,
  Table2, ListOrdered, QrCode, ExternalLink, Save
} from "lucide-vue-next";
import {
  createFormApi, updateFormApi, publishFormApi, deleteFormApi, getFormApi, listSubmissionsApi, getIpStatsApi, type FormField, type FieldType
} from "../../api/forms";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { nativeConfirm } from "../../services/nativeDialog";
import FieldInspector from "./components/FieldInspector.vue";
import FieldPalette from "./components/FieldPalette.vue";
import FormCanvas from "./components/FormCanvas.vue";
import FormSettings from "./components/FormSettings.vue";
import FormStats from "./components/FormStats.vue";
import "./css/form-editor.css";

const router = useRouter();
const route = useRoute();
const isEditing = computed(() => route.params.id !== undefined);
const formId = computed(() => route.params.id ? Number(route.params.id) : null);

// 当前标签页
const initialTab = route.query.tab;
const activeTab = ref<'edit' | 'stats' | 'settings'>(
  initialTab === "stats" || initialTab === "settings" ? initialTab : "edit"
);

// 生成唯一ID
function generateId() {
  return crypto.randomUUID();
}

// 表单数据
const title = ref("");
const description = ref("");
const fields = ref<FormField[]>([]);
const config = ref({
  allowMultiple: true,
  maxSubmissions: null as number | null,
  privacyNotice: "提交内容仅用于本表单所述用途。",
  retentionDays: 180 as number | null,
  storeUserAgent: false
});
const exclusiveInfo = ref<Record<string, string>>({});  // 专属信息

// UI状态
const loading = ref(false);
const ready = ref(false);
const skipLeaveGuard = ref(false);
const saving = ref(false);
const savedAt = ref("");
const error = ref("");
const selectedFieldId = ref<string | null>(null);
const copied = ref(false);
const mobileEditStep = ref<"fields" | "settings" | "preview">("fields");
const mobileFieldPickerOpen = ref(false);

// 设置面板状态
const formStatus = ref<"draft" | "published" | "closed">("draft");
const urlCopied = ref(false);
const deleteDialogOpen = ref(false);

// 统计数据
const statsData = ref({
  submissionCount: 0,
  viewCount: 0,
  ipCount: 0,
  sampleCount: 0,
  fieldStats: [] as { fieldId: string; label: string; count: number; percentage: number }[]
});

// 题型分类
type FieldCategory = {
  title: string;
  items: Array<{ type: FieldType; name: string; desc: string; icon: Component; color: string; tag?: string }>;
};

const fieldCategories: Record<"basic" | "advanced" | "preset", FieldCategory> = {
  basic: {
    title: "常用字段",
    items: [
      { type: "text" as FieldType, name: "单行文本", desc: "短内容", icon: TextIcon, color: "text" },
      { type: "textarea" as FieldType, name: "多行文本", desc: "长内容", icon: FileText, color: "text" },
      { type: "number" as FieldType, name: "数字", desc: "数值范围", icon: Hash, color: "text" },
      { type: "radio" as FieldType, name: "单选题", desc: "选择一项", icon: CircleDot, color: "radio" },
      { type: "multiselect" as FieldType, name: "多选题", desc: "选择多项", icon: CheckSquare, color: "checkbox" },
      { type: "checkbox" as FieldType, name: "同意确认", desc: "单项勾选", icon: Square, color: "checkbox" },
      { type: "select" as FieldType, name: "下拉选择", desc: "下拉菜单", icon: List, color: "select" },
      { type: "date" as FieldType, name: "日期", desc: "选择日期", icon: Calendar, color: "date" },
      { type: "rating" as FieldType, name: "评分", desc: "1 到 5 星", icon: RatingIcon, color: "rating" }
    ]
  },
  advanced: {
    title: "结构",
    items: [{ type: "section" as FieldType, name: "分节标题", desc: "整理长表单", icon: FileText, color: "section" }]
  },
  preset: {
    title: "常用题库",
    items: [
      { type: "name" as FieldType, name: "姓名", desc: "输入姓名", icon: User, color: "text", tag: "常用" },
      { type: "phone" as FieldType, name: "手机号", desc: "手机号码", icon: Phone, color: "text", tag: "常用" },
      { type: "idcard" as FieldType, name: "身份证号", desc: "身份证号", icon: CreditCard, color: "text", tag: "常用" },
      { type: "gender" as FieldType, name: "性别", desc: "男、女、其他", icon: CircleDot, color: "radio", tag: "常用" },
      { type: "age" as FieldType, name: "年龄", desc: "输入年龄", icon: Hash, color: "text", tag: "常用" },
      { type: "address" as FieldType, name: "地址", desc: "详细地址", icon: MapPin, color: "text", tag: "常用" },
      { type: "email" as FieldType, name: "邮箱", desc: "邮箱地址", icon: Mail, color: "text", tag: "常用" }
    ]
  }
};

const selectedField = computed(() =>
  fields.value.find(f => f.id === selectedFieldId.value) || null
);

// 题型搜索
const searchQuery = ref("");
const filteredCategories = computed(() => {
  if (!searchQuery.value.trim()) return fieldCategories;
  const query = searchQuery.value.toLowerCase();
  const filtered: typeof fieldCategories = { basic: { title: "搜索结果", items: [] }, advanced: { title: "", items: [] }, preset: { title: "", items: [] } };

  for (const cat of Object.values(fieldCategories)) {
    for (const item of cat.items) {
      if (item.name.includes(query) || item.desc.includes(query)) {
        filtered.basic.items.push(item);
      }
    }
  }
  return filtered;
});

// 加载数据
async function loadForm() {
  if (!formId.value) return;
  loading.value = true;
  try {
    const res = await getFormApi(formId.value);
    title.value = res.form.title;
    description.value = res.form.description || "";
    fields.value = res.form.fields;
    config.value = {
      allowMultiple: res.form.allowMultiple,
      maxSubmissions: res.form.maxSubmissions,
      privacyNotice: res.form.privacyNotice || "",
      retentionDays: res.form.retentionDays,
      storeUserAgent: res.form.storeUserAgent
    };
    exclusiveInfo.value = res.form.exclusiveInfo || {};
    formStatus.value = res.form.status;
    formUrl.value = res.form.status === "published"
      ? `${window.location.origin}/f/${res.form.formUid}`
      : "";
    published.value = res.form.status === "published";

    // 加载统计数据
    await loadStats();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
    ready.value = true;
  }
}

// 加载统计数据
async function loadStats() {
  if (!formId.value) return;
  try {
    const [subRes, ipRes] = await Promise.all([
      listSubmissionsApi(formId.value, { pageSize: 100 }),
      getIpStatsApi(formId.value)
    ]);

    statsData.value = {
      submissionCount: subRes.form.submissionCount,
      viewCount: subRes.form.viewCount,
      ipCount: ipRes.stats.length,
      sampleCount: subRes.submissions.length,
      fieldStats: calculateFieldStats(subRes.submissions, subRes.form.fields)
    };
  } catch (e) {
    // 统计加载失败不影响主流程
    console.warn("统计加载失败", e);
  }
}

// 计算字段统计
function calculateFieldStats(submissions: { data: Record<string, unknown> }[], fields: FormField[]) {
  return fields
    .filter(f => f.type !== "section")
    .map(field => {
      const count = submissions.filter(sub => {
        const value = sub.data[field.id];
        return value !== undefined && value !== null && value !== "" &&
               (Array.isArray(value) ? value.length > 0 : true);
      }).length;
      const percentage = submissions.length > 0 ? Math.round((count / submissions.length) * 100) : 0;
      return { fieldId: field.id, label: field.label, count, percentage };
    });
}

function normalizePositiveInteger(value: unknown, max?: number) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || (max !== undefined && number > max)) return null;
  return number;
}

// 配置变更保存
async function onConfigChange() {
  const rawMaxSubmissions: unknown = config.value.maxSubmissions;
  const maxSubmissions = normalizePositiveInteger(rawMaxSubmissions);
  if (rawMaxSubmissions !== "" && rawMaxSubmissions !== null && rawMaxSubmissions !== undefined && maxSubmissions === null) {
    error.value = "提交份数必须是正整数";
    return;
  }
  const rawRetentionDays: unknown = config.value.retentionDays;
  const retentionDays = normalizePositiveInteger(rawRetentionDays, 3650);
  if (rawRetentionDays !== "" && rawRetentionDays !== null && rawRetentionDays !== undefined && retentionDays === null) {
    error.value = "数据保留天数必须是 1 到 3650 的整数";
    return;
  }
  config.value.maxSubmissions = maxSubmissions;
  config.value.retentionDays = retentionDays;
  saveState.value = "pending";
  if (formId.value) await save();
}

// 专属信息变更保存
async function onExclusiveInfoChange() {
  saveState.value = "pending";
  if (formId.value) await save();
}

// 添加专属信息项
function addExclusiveItem() {
  let index = Object.keys(exclusiveInfo.value).length + 1;
  let label = index === 1 ? "说明" : `说明 ${index}`;
  while (label in exclusiveInfo.value) {
    index += 1;
    label = `说明 ${index}`;
  }
  exclusiveInfo.value[label] = "";
  saveState.value = "pending";
}

// 删除专属信息项
function removeExclusiveItem(key: string) {
  delete exclusiveInfo.value[key];
  void onExclusiveInfoChange();
}

function renameExclusiveItem(oldKey: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const newKey = input.value.trim();
  if (!newKey || newKey === oldKey) {
    input.value = oldKey;
    return;
  }
  if (newKey in exclusiveInfo.value) {
    error.value = "专属信息名称不能重复";
    input.value = oldKey;
    return;
  }
  exclusiveInfo.value = Object.fromEntries(
    Object.entries(exclusiveInfo.value).map(([key, value]) => [key === oldKey ? newKey : key, value])
  );
  void onExclusiveInfoChange();
}

// 切换表单状态
async function toggleFormStatus() {
  if (!formId.value) return;
  if (formStatus.value === "draft") {
    error.value = "请先发布表单";
    return;
  }
  const action = formStatus.value === "closed" ? "publish" : "close";
  try {
    const res = await publishFormApi(formId.value, action);
    formStatus.value = res.form.status;
    published.value = res.form.status === "published";
    if (res.form.status === "published") {
      formUrl.value = `${window.location.origin}/f/${res.form.formUid}`;
    } else {
      formUrl.value = "";
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "操作失败";
  }
}

// 复制表单链接
function copyFormUrl() {
  if (!formUrl.value) return;
  navigator.clipboard.writeText(formUrl.value).then(() => {
    urlCopied.value = true;
    setTimeout(() => urlCopied.value = false, 2000);
  });
}

// 确认删除
function confirmDelete() {
  deleteDialogOpen.value = true;
}

// 执行删除
async function doDeleteForm() {
  if (!formId.value) return;
  try {
    await deleteFormApi(formId.value);
    skipLeaveGuard.value = true;
    router.push("/admin/forms");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "删除失败";
  } finally {
    deleteDialogOpen.value = false;
  }
}

// 添加字段
function addField(type: FieldType, name?: string) {
  const field: FormField = {
    id: generateId(),
    type,
    label: name || `问题${fields.value.length + 1}`,
    required: false,
    order: fields.value.length,
    ...(type === "select" || type === "radio" || type === "multiselect" ? { options: ["选项1", "选项2"] } : {}),
    ...(type === "number" || type === "age" ? { min: 0, max: 150 } : {}),
    ...(type === "text" || type === "name" || type === "textarea" ? { maxLength: 500 } : {})
  };
  fields.value.push(field);
  selectedFieldId.value = field.id;
  mobileFieldPickerOpen.value = false;
  if (window.matchMedia("(max-width: 900px)").matches) mobileEditStep.value = "settings";
  saveState.value = "pending";
}

function selectField(id: string) {
  selectedFieldId.value = id;
  if (window.matchMedia("(max-width: 900px)").matches) mobileEditStep.value = "settings";
}

// 删除字段
function deleteField(id: string) {
  fields.value = fields.value.filter(f => f.id !== id);
  if (selectedFieldId.value === id) {
    selectedFieldId.value = null;
  }
  saveState.value = "pending";
}

// 移动字段
function moveField(fromIndex: number, direction: "up" | "down") {
  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= fields.value.length) return;
  const temp = fields.value[fromIndex];
  fields.value[fromIndex] = fields.value[toIndex];
  fields.value[toIndex] = temp;
  fields.value.forEach((f, i) => f.order = i);
  saveState.value = "pending";
}

// 拖拽排序
const draggingIndex = ref<number | null>(null);

function onDragStart(index: number) {
  draggingIndex.value = index;
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault();
  if (draggingIndex.value === null || draggingIndex.value === index) return;
}

function onDrop(e: DragEvent, toIndex: number) {
  e.preventDefault();
  if (draggingIndex.value === null || draggingIndex.value === toIndex) return;

  const fromIndex = draggingIndex.value;
  const draggedField = fields.value[fromIndex];
  // 移动字段
  fields.value.splice(fromIndex, 1);
  fields.value.splice(toIndex, 0, draggedField);

  // 更新order
  fields.value.forEach((f, i) => f.order = i);
  saveState.value = "pending";
  draggingIndex.value = null;
}

function onDragEnd() {
  draggingIndex.value = null;
}

// 切换标签页
function switchTab(tab: 'edit' | 'stats' | 'settings') {
  activeTab.value = tab;
  router.replace({ query: { ...route.query, tab } });
  if (tab === "stats") void loadStats();
}

function copyLink() {
  if (!formUrl.value) return;
  navigator.clipboard.writeText(formUrl.value).then(() => {
    copied.value = true;
    setTimeout(() => copied.value = false, 2000);
  });
}

// 保存状态
const saveState = ref<"idle" | "pending" | "saving" | "saved" | "error">("idle");
const saveStatusText = computed(() => {
  if (saving.value || saveState.value === "saving") return "保存中...";
  if (saveState.value === "pending") return "待保存";
  if (saveState.value === "error") return "保存失败";
  if (savedAt.value) return `已保存 ${savedAt.value}`;
  return "";
});

function optionalFiniteNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function fieldsForSave() {
  return fields.value.map((field, index): FormField => {
    const normalized: FormField = {
      ...JSON.parse(JSON.stringify(toRaw(field))) as FormField,
      label: field.label.trim(),
      order: index
    };
    const min = optionalFiniteNumber(field.min);
    const max = optionalFiniteNumber(field.max);
    const maxLength = optionalFiniteNumber(field.maxLength);
    if (min === undefined) delete normalized.min;
    else normalized.min = min;
    if (max === undefined) delete normalized.max;
    else normalized.max = max;
    if (maxLength === undefined || !Number.isInteger(maxLength)) delete normalized.maxLength;
    else normalized.maxLength = maxLength;
    if (normalized.options) normalized.options = normalized.options.map((option) => option.trim()).filter(Boolean);
    if (normalized.placeholder !== undefined) {
      normalized.placeholder = normalized.placeholder.trim() || undefined;
    }
    return normalized;
  });
}

// 保存
async function save(): Promise<number | null> {
  if (!title.value.trim()) {
    error.value = "请填写表单标题";
    return null;
  }
  saving.value = true;
  saveState.value = "saving";
  error.value = "";
  try {
    const body = {
      title: title.value.trim(),
      description: description.value.trim() || undefined,
      fields: fieldsForSave(),
      config: JSON.parse(JSON.stringify(toRaw(config.value))),
      exclusiveInfo: Object.keys(exclusiveInfo.value).length > 0 ? exclusiveInfo.value : null
    };
    let savedFormId: number;
    if (isEditing.value && formId.value) {
      savedFormId = formId.value;
      await updateFormApi(savedFormId, body);
    } else {
      const res = await createFormApi(body);
      savedFormId = res.form.id;
      skipLeaveGuard.value = true;
      try {
        await router.replace(`/admin/forms/${savedFormId}`);
      } finally {
        skipLeaveGuard.value = false;
      }
    }
    savedAt.value = new Date().toLocaleTimeString();
    saveState.value = "saved";
    return savedFormId;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
    saveState.value = "error";
    return null;
  } finally {
    saving.value = false;
  }
}

// 发布
const published = ref(false);
const formUrl = ref("");

async function publish() {
  if (!fields.value.some((field) => field.type !== "section")) {
    error.value = "请先添加至少一个问题";
    return;
  }
  const savedFormId = await save();
  if (!savedFormId || error.value) return;

  try {
    const res = await publishFormApi(savedFormId, "publish");
    formUrl.value = `${window.location.origin}/f/${res.form.formUid}`;
    published.value = true;
    formStatus.value = "published";
    switchTab('stats');
  } catch (e) {
    error.value = e instanceof Error ? e.message : "发布失败";
  }
}

// 在新标签页打开表单
function openForm() {
  if (formUrl.value) {
    window.open(formUrl.value, "_blank");
  }
}

// 添加选项
function addOption() {
  if (!selectedField.value) return;
  const field = selectedField.value;
  if (!field.options) field.options = [];
  field.options.push(`选项${field.options.length + 1}`);
  saveState.value = "pending";
}

// 删除选项
function removeOption(index: number) {
  if (!selectedField.value?.options) return;
  if (selectedField.value.options.length <= 1) {
    error.value = "选择题至少保留一个选项";
    return;
  }
  selectedField.value.options.splice(index, 1);
  saveState.value = "pending";
}

// 监听变更
watch([title, description, fields, config], () => {
  if (ready.value && !saving.value && saveState.value !== "error") {
    saveState.value = "pending";
  }
}, { deep: true });

// 监听路由
watch(() => route.query.tab, (tab) => {
  if (tab === 'edit' || tab === 'stats' || tab === 'settings') {
    activeTab.value = tab;
  } else {
    activeTab.value = 'edit';
  }
});

onMounted(() => {
  if (isEditing.value) void loadForm();
  else ready.value = true;
});

onBeforeRouteLeave(async () => {
  if (skipLeaveGuard.value || (saveState.value !== "pending" && saveState.value !== "error")) return true;
  return await nativeConfirm({
    title: "离开表单编辑",
    message: "还有修改未保存，离开后这些修改会丢失。",
    confirmText: "放弃修改",
    danger: true
  });
});
</script>

<template>
  <div class="form-editor">
    <!-- 顶部导航栏 -->
    <header class="form-header">
      <div class="form-header__left">
        <button class="form-header__back" type="button" aria-label="返回收集表列表" @click="router.push('/admin/forms')">
          <ArrowLeft :size="18" />
        </button>
        <div class="form-header__title-area">
          <input
            v-model="title"
            class="form-header__title"
            placeholder="空白收集表"
          />
          <span class="form-header__status" :class="`is-${formStatus}`">
            {{ formStatus === 'published' ? '收集中' : formStatus === 'closed' ? '已暂停' : '草稿' }}
          </span>
        </div>
      </div>

      <!-- 标签页 -->
      <nav class="form-header__tabs">
        <button class="form-tab" :class="{ active: activeTab === 'edit' }" @click="switchTab('edit')">
          编辑
        </button>
        <button class="form-tab" :class="{ active: activeTab === 'stats' }" @click="switchTab('stats')">
          统计
        </button>
        <button class="form-tab" :class="{ active: activeTab === 'settings' }" @click="switchTab('settings')">
          设置
        </button>
      </nav>

      <div class="form-header__right">
        <span v-if="saveStatusText" class="save-status" :class="{ 'is-error': saveState === 'error' }">
          {{ saveStatusText }}
        </span>
        <button class="form-header__action" type="button" @click="save" :disabled="saving" title="保存表单" aria-label="保存表单">
          <Save :size="16" />
        </button>
        <button class="form-header__action" type="button" @click="copyLink" :disabled="!formUrl" :title="copied ? '已复制' : '复制公开链接'" :aria-label="copied ? '已复制' : '复制公开链接'">
          <component :is="copied ? Check : Copy" :size="16" />
        </button>
      </div>
    </header>

    <!-- 错误提示 -->
    <div v-if="error" class="form-error">
      <span>{{ error }}</span>
      <button @click="error = ''"><X :size="14" /></button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="form-loading">
      <div class="form-loading__spinner"></div>
    </div>

    <!-- 主内容区 - 仅编辑页面显示 -->
    <div v-else-if="activeTab === 'edit'" class="form-body">
      <nav class="form-editor-mobile-steps" aria-label="手机端表单编辑步骤">
        <button type="button" :class="{ active: mobileEditStep === 'fields' }" @click="mobileEditStep = 'fields'">字段列表</button>
        <button type="button" :class="{ active: mobileEditStep === 'settings' }" :disabled="!selectedField" @click="mobileEditStep = 'settings'">字段设置</button>
        <button type="button" :class="{ active: mobileEditStep === 'preview' }" @click="mobileEditStep = 'preview'">预览</button>
      </nav>
      <!-- 左侧题型面板 -->
      <FieldPalette :class="{ 'is-mobile-open': mobileFieldPickerOpen }">
        <button class="form-editor-mobile-picker-close" type="button" @click="mobileFieldPickerOpen = false"><X :size="16" />关闭题型</button>
        <!-- 搜索框 -->
        <div class="form-field-panel__search">
          <div class="form-field-panel__search-input">
            <Search :size="14" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索题型"
            />
          </div>
        </div>

        <!-- 题型列表 -->
        <div class="form-field-panel__content">
          <template v-for="(category, key) in filteredCategories" :key="key">
            <div v-if="category.items.length > 0" class="form-field-section">
              <h3 class="form-field-section__title">{{ category.title }}</h3>
              <div class="form-field-section__list">
                <button
                  v-for="item in category.items"
                  :key="item.type"
                  class="form-field-card"
                  @click="addField(item.type, item.name)"
                >
                  <div class="form-field-card__icon" :class="item.color">
                    <component :is="item.icon" :size="16" />
                  </div>
                  <div class="form-field-card__info">
                    <span class="form-field-card__name">
                      {{ item.name }}
                      <span v-if="item.tag" class="form-field-card__tag">{{ item.tag }}</span>
                    </span>
                    <span class="form-field-card__desc">{{ item.desc }}</span>
                  </div>
                  <Plus class="form-muted-icon" :size="14" />
                </button>
              </div>
            </div>
          </template>
        </div>
      </FieldPalette>

      <!-- 中间表单画布 -->
      <FormCanvas :class="{ 'is-mobile-fields': mobileEditStep === 'fields', 'is-mobile-preview': mobileEditStep === 'preview' }">
        <div class="form-canvas__inner">
          <!-- 表单头部 -->
          <div class="form-canvas__header">
            <input
              v-model="title"
              class="form-canvas__title-input"
              placeholder="请添加标题"
            />
            <textarea
              v-model="description"
              class="form-canvas__desc-input"
              placeholder="添加描述：文字、图片或链接"
              rows="2"
            ></textarea>
          </div>

          <!-- 字段列表 -->
          <div class="form-fields-list">
            <div
              v-for="(field, index) in fields"
              :key="field.id"
              class="form-field-item"
              :class="{ selected: selectedFieldId === field.id, dragging: draggingIndex === index }"
              draggable="true"
              @click="selectField(field.id)"
              @dragstart="onDragStart(index)"
              @dragover="(e) => onDragOver(e, index)"
              @drop="(e) => onDrop(e, index)"
              @dragend="onDragEnd"
            >
              <div class="form-field-item__drag">
                <GripVertical :size="16" />
              </div>
              <div class="form-field-item__content">
                <div class="form-field-item__header">
                  <span class="form-field-item__label">{{ field.label }}</span>
                  <span v-if="field.required" class="form-field-item__required">必填</span>
                </div>
                <div class="form-field-item__preview">
                  <template v-if="field.type === 'text' || field.type === 'name' || field.type === 'phone' || field.type === 'email' || field.type === 'idcard' || field.type === 'address'">
                    <div class="form-field-preview">{{ field.placeholder || '请输入...' }}</div>
                  </template>
                  <template v-else-if="field.type === 'textarea'">
                    <div class="form-field-preview form-field-preview--multiline">{{ field.placeholder || '请输入...' }}</div>
                  </template>
                  <template v-else-if="field.type === 'number' || field.type === 'age'">
                    <div class="form-field-preview form-field-preview--number">
                      <span class="form-field-preview__range" v-if="field.min !== undefined || field.max !== undefined">
                        {{ field.min !== undefined ? field.min : '?' }} - {{ field.max !== undefined ? field.max : '?' }}
                      </span>
                      <span v-else>0</span>
                    </div>
                  </template>
                  <template v-else-if="field.type === 'select'">
                    <div class="form-field-preview radio">
                      {{ field.placeholder || '请选择' }}
                      <ChevronDown :size="14" />
                    </div>
                  </template>
                  <template v-else-if="field.type === 'radio'">
                    <div class="form-field-preview radio-group">
                      <div v-for="opt in (field.options || ['选项1', '选项2'])" :key="opt" class="form-field-preview__option">
                        <span class="form-field-preview__radio"></span>
                        {{ opt }}
                      </div>
                    </div>
                  </template>
                  <template v-else-if="field.type === 'checkbox'">
                    <div class="form-field-preview checkbox-group">
                      <div class="form-field-preview__option">
                        <span class="form-field-preview__checkbox"></span>
                        {{ field.label }}
                      </div>
                    </div>
                  </template>
                  <template v-else-if="field.type === 'date' || field.type === 'datetime' || field.type === 'time'">
                    <div class="form-field-preview">
                      <Calendar class="form-inline-icon" :size="14" />
                      {{ field.type === 'date' ? '选择日期' : field.type === 'time' ? '选择时间' : '选择日期和时间' }}
                    </div>
                  </template>
                  <template v-else-if="field.type === 'rating'">
                    <div class="form-field-preview rating-preview">★★★★★</div>
                  </template>
                  <template v-else-if="field.type === 'file'">
                    <div class="form-field-preview">
                      <Upload class="form-inline-icon" :size="14" />
                      点击上传文件
                    </div>
                  </template>
                  <template v-else-if="field.type === 'image'">
                    <div class="form-field-preview image-preview">
                      <ImageIcon :size="20" />
                      <span>点击上传图片</span>
                    </div>
                  </template>
                  <template v-else-if="field.type === 'location'">
                    <div class="form-field-preview">
                      <MapPinned class="form-inline-icon" :size="14" />
                      点击获取位置
                    </div>
                  </template>
                  <template v-else-if="field.type === 'signature'">
                    <div class="form-field-preview signature-preview">
                      <PenTool class="form-inline-icon" :size="14" />
                      点击签名
                    </div>
                  </template>
                  <template v-else-if="field.type === 'gender'">
                    <div class="form-field-preview radio-group">
                      <div class="form-field-preview__option"><span class="form-field-preview__radio"></span>男</div>
                      <div class="form-field-preview__option"><span class="form-field-preview__radio"></span>女</div>
                      <div class="form-field-preview__option"><span class="form-field-preview__radio"></span>其他</div>
                    </div>
                  </template>
                  <template v-else-if="field.type === 'section'">
                    <div class="form-field-preview section-preview">分节标题</div>
                  </template>
                  <template v-else-if="field.type === 'city'">
                    <div class="form-field-preview city-preview">
                      <MapPin class="form-inline-icon" :size="14" />
                      省份 / 城市
                    </div>
                  </template>
                  <template v-else-if="field.type === 'scale'">
                    <div class="form-field-preview scale-preview">
                      <SlidersHorizontal class="form-inline-icon" :size="14" />
                      滑动选择
                    </div>
                  </template>
                  <template v-else-if="field.type === 'matrix' || field.type === 'matrix_text'">
                    <div class="form-field-preview matrix-preview">
                      <Grid3X3 class="form-inline-icon" :size="14" />
                      矩阵选择题
                    </div>
                  </template>
                  <template v-else-if="field.type === 'table'">
                    <div class="form-field-preview table-preview">
                      <Table2 class="form-inline-icon" :size="14" />
                      表格填写
                    </div>
                  </template>
                  <template v-else-if="field.type === 'sort'">
                    <div class="form-field-preview sort-preview">
                      <ListOrdered class="form-inline-icon" :size="14" />
                      拖拽排序
                    </div>
                  </template>
                  <template v-else-if="field.type === 'qrcode'">
                    <div class="form-field-preview">
                      <QrCode class="form-inline-icon" :size="14" />
                      扫码填写
                    </div>
                  </template>
                  <template v-else-if="field.type === 'multiselect'">
                    <div class="form-field-preview checkbox-group">
                      <div v-for="opt in (field.options || ['选项1', '选项2'])" :key="opt" class="form-field-preview__option">
                        <span class="form-field-preview__checkbox"></span>
                        {{ opt }}
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div class="form-field-preview">{{ field.placeholder || '请输入...' }}</div>
                  </template>
                </div>
              </div>
              <div class="form-field-item__actions">
                <button class="form-field-item__action-btn" @click.stop="moveField(index, 'up')" :disabled="index === 0">
                  <ChevronUp :size="14" />
                </button>
                <button class="form-field-item__action-btn" @click.stop="moveField(index, 'down')" :disabled="index === fields.length - 1">
                  <ChevronDown :size="14" />
                </button>
                <button class="form-field-item__action-btn delete" @click.stop="deleteField(field.id)">
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-if="fields.length === 0" class="form-canvas__empty">
              <FileText :size="40" />
              <p>添加第一个字段</p>
              <button class="cd-button primary" type="button" @click="mobileFieldPickerOpen = true"><Plus :size="16" />选择题型</button>
            </div>
          </div>

          <!-- 添加问题按钮 -->
          <button v-if="fields.length > 0" class="form-canvas__add-btn" type="button" @click="mobileFieldPickerOpen = true">
            <Plus :size="16" />
            添加问题
          </button>
        </div>
      </FormCanvas>

      <!-- 右侧属性面板 -->
      <FieldInspector :class="{ 'is-mobile-open': mobileEditStep === 'settings' }">
        <template v-if="selectedField">
          <div class="form-props-panel__header">
            <h3 class="form-props-panel__title">字段属性</h3>
            <button class="form-props-panel__close" type="button" aria-label="关闭字段设置" @click="selectedFieldId = null">
              <X :size="16" />
            </button>
          </div>
          <div class="form-props-panel__content">
            <div class="form-props-panel__section">
              <label class="form-props-panel__label">{{ selectedField.type === 'section' ? '分节标题' : '问题标题' }}</label>
              <input v-model="selectedField.label" type="text" class="form-props-panel__input" />
            </div>

            <div class="form-props-panel__section">
              <label class="form-props-panel__label">{{ selectedField.type === 'section' ? '分节说明' : '描述文字' }}</label>
              <input v-model="selectedField.placeholder" type="text" class="form-props-panel__input" placeholder="提示填写者..." />
            </div>

            <div v-if="selectedField.type !== 'section'" class="form-props-panel__section">
              <label class="form-checkbox">
                <input v-model="selectedField.required" type="checkbox" />
                <span class="form-checkbox__box"></span>
                必填
              </label>
            </div>

            <!-- 选项编辑器 -->
            <template v-if="selectedField.type === 'radio' || selectedField.type === 'multiselect' || selectedField.type === 'select'">
              <div class="form-props-panel__divider"></div>
              <div class="form-props-panel__section">
                <label class="form-props-panel__label">选项</label>
                <div class="form-options-editor">
                  <div v-for="(opt, i) in selectedField.options" :key="i" class="form-option-row">
                    <input v-model="selectedField.options![i]" type="text" class="form-props-panel__input" />
                    <button class="form-option-row__remove" type="button" :aria-label="`删除选项 ${i + 1}`" @click="removeOption(i)">
                      <X :size="12" />
                    </button>
                  </div>
                  <button class="form-add-option-btn" type="button" @click="addOption">
                    <Plus :size="14" /> 添加选项
                  </button>
                </div>
              </div>
            </template>

            <!-- 数字类型 -->
            <template v-if="selectedField.type === 'number' || selectedField.type === 'age'">
              <div class="form-props-panel__divider"></div>
              <div class="form-props-panel__section">
                <label class="form-props-panel__label">数值范围</label>
                <div class="form-range-grid">
                  <input v-model.number="selectedField.min" type="number" class="form-props-panel__input" placeholder="最小值" />
                  <input v-model.number="selectedField.max" type="number" class="form-props-panel__input" placeholder="最大值" />
                </div>
              </div>
            </template>

            <!-- 文本类型 -->
            <template v-if="selectedField.type === 'text' || selectedField.type === 'name' || selectedField.type === 'textarea' || selectedField.type === 'phone' || selectedField.type === 'email' || selectedField.type === 'idcard' || selectedField.type === 'address'">
              <div class="form-props-panel__divider"></div>
              <div class="form-props-panel__section">
                <label class="form-props-panel__label">最大字数</label>
                <input v-model.number="selectedField.maxLength" type="number" min="1" max="2000" class="form-props-panel__input" placeholder="不限制" />
              </div>
            </template>
          </div>
        </template>

        <template v-else>
          <div class="form-props-panel__empty">
            <Edit3 :size="32" />
            <p>选择问题以编辑属性</p>
          </div>
        </template>
      </FieldInspector>
    </div>

    <!-- 统计页面 -->
    <FormStats v-else-if="activeTab === 'stats'">
      <main class="form-stats-content">
        <div class="form-stats-status">
          <span v-if="formStatus === 'published'" class="form-stats-status__badge published">收集中</span>
          <span v-else-if="formStatus === 'closed'" class="form-stats-status__badge closed">已暂停</span>
          <span v-else class="form-stats-status__badge">暂未发布</span>
          <button v-if="formUrl" class="form-stats-copy-btn" @click="copyLink">
            <Copy :size="14" />
            {{ copied ? '已复制' : '复制链接' }}
          </button>
        </div>
        <div class="form-stats-cards">
          <div class="form-stats-card">
            <div class="form-stats-card__header">
              <h3>收集概况</h3>
            </div>
            <div class="form-stats-card__body">
              <div class="form-stats-metric">
                <span class="form-stats-metric__value">{{ statsData.submissionCount }}</span>
                <span class="form-stats-metric__label">提交数</span>
              </div>
              <div class="form-stats-metric">
                <span class="form-stats-metric__value">{{ statsData.viewCount }}</span>
                <span class="form-stats-metric__label">访问数</span>
              </div>
              <div class="form-stats-metric">
                <span class="form-stats-metric__value">{{ statsData.ipCount }}</span>
                <span class="form-stats-metric__label">来源数（最多 100）</span>
              </div>
            </div>
          </div>
          <div class="form-stats-card">
            <div class="form-stats-card__header">
              <h3>字段完成度{{ statsData.sampleCount ? `（最近 ${statsData.sampleCount} 份）` : '' }}</h3>
            </div>
            <div class="form-stats-card__body form-stats-chart">
              <div v-if="statsData.fieldStats.length === 0" class="form-stats-empty">暂无数据</div>
              <div v-else class="form-stats-field-list">
                <div v-for="stat in statsData.fieldStats" :key="stat.fieldId" class="form-stats-field-item">
                  <span class="form-stats-field-label">{{ stat.label }}</span>
                  <div class="form-stats-field-bar">
                    <div class="form-stats-field-fill" :style="{ width: stat.percentage + '%' }"></div>
                  </div>
                  <span class="form-stats-field-count">{{ stat.count }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="form-stats-card form-stats-card--full">
          <div class="form-stats-card__header">
            <h3>收集限制</h3>
          </div>
          <div class="form-stats-card__body form-stats-grid">
            <div class="form-stats-metric">
              <span class="form-stats-metric__value">{{ config.maxSubmissions || '∞' }}</span>
              <span class="form-stats-metric__label">份数限制</span>
            </div>
            <div class="form-stats-metric">
              <span class="form-stats-metric__value">{{ config.allowMultiple ? '是' : '否' }}</span>
              <span class="form-stats-metric__label">允许多份</span>
            </div>
            <div class="form-stats-metric">
              <span class="form-stats-metric__value">{{ fields.filter(f => f.type !== 'section').length }}</span>
              <span class="form-stats-metric__label">问题数量</span>
            </div>
            <div class="form-stats-metric">
              <span class="form-stats-metric__value">{{ fields.filter(f => f.type !== 'section' && f.required).length }}</span>
              <span class="form-stats-metric__label">必填问题</span>
            </div>
          </div>
        </div>
      </main>
    </FormStats>

    <!-- 设置页面 -->
    <FormSettings v-else-if="activeTab === 'settings'">
      <main class="form-settings-content">
        <!-- 收集设置 -->
        <div class="form-settings-card">
          <div class="form-settings-row">
            <div class="form-settings-row__info">
              <span class="form-settings-row__label">收集状态</span>
              <span class="form-settings-row__desc">
                {{ formStatus === 'draft' ? '发布后填写者才能访问' : formStatus === 'closed' ? '当前已停止接收提交' : '公开链接正在接收提交' }}
              </span>
            </div>
            <button v-if="formStatus !== 'draft'" class="form-settings-link" :class="{ 'is-active': formStatus === 'closed' }" type="button" @click="toggleFormStatus">
              {{ formStatus === 'closed' ? '重新开放' : '暂停收集' }}
            </button>
            <span v-else class="form-settings-state">草稿</span>
          </div>
          <div class="form-settings-row">
            <div class="form-settings-row__info">
              <span class="form-settings-row__label">限制提交份数</span>
              <span class="form-settings-row__desc">达到上限后停止接收新提交</span>
            </div>
            <div class="form-settings-limit-input">
              <input
                v-model.number="config.maxSubmissions"
                type="number"
                min="1"
                placeholder="不限"
                aria-label="最多提交份数"
                class="form-settings-input"
                @change="onConfigChange"
              />
              <span class="form-settings-limit-unit">份</span>
            </div>
          </div>
        </div>

        <!-- 填写权限 -->
        <div class="form-settings-card">
          <div class="form-settings-row">
            <div class="form-settings-row__info">
              <span class="form-settings-row__label">允许填写人提交多份</span>
            </div>
            <label class="form-switch">
              <input v-model="config.allowMultiple" type="checkbox" @change="onConfigChange" />
              <span class="form-switch__track"></span>
            </label>
          </div>
          <div class="form-settings-row">
            <div class="form-settings-row__info">
              <span class="form-settings-row__label">保存浏览器信息</span>
              <span class="form-settings-row__desc">默认关闭；开启后仅保存截断到 512 字符的 User-Agent</span>
            </div>
            <label class="form-switch">
              <input v-model="config.storeUserAgent" type="checkbox" @change="onConfigChange" />
              <span class="form-switch__track"></span>
            </label>
          </div>
        </div>

        <!-- 表单链接 -->
        <div class="form-settings-card">
          <div class="form-settings-row">
            <div class="form-settings-row__info">
              <span class="form-settings-row__label">表单链接</span>
              <span class="form-settings-row__desc">{{ formUrl || '发布后可见' }}</span>
            </div>
            <button v-if="formUrl" class="form-settings-link" @click="copyFormUrl">
              {{ urlCopied ? '已复制' : '复制链接' }}
              <Copy :size="14" />
            </button>
            <button v-else-if="formId" class="form-settings-link" @click="publish">
              发布后获取
              <ExternalLink :size="14" />
            </button>
          </div>
        </div>

        <div class="form-settings-card">
          <div class="form-settings-card__header">
            <h3>隐私与保留</h3>
          </div>
          <label class="form-props-panel__section">
            <span class="form-props-panel__label">公开页隐私说明</span>
            <textarea
              v-model="config.privacyNotice"
              class="form-props-panel__input"
              rows="3"
              maxlength="500"
              placeholder="说明收集目的和数据使用范围"
              @blur="onConfigChange"
            ></textarea>
          </label>
          <label class="form-props-panel__section">
            <span class="form-props-panel__label">数据保留天数</span>
            <input
              v-model.number="config.retentionDays"
              class="form-props-panel__input"
              type="number"
              min="1"
              max="3650"
              placeholder="不自动清理"
              aria-label="数据保留天数"
              @change="onConfigChange"
            />
          </label>
        </div>

        <!-- 专属信息设置 -->
        <div class="form-settings-card">
          <div class="form-settings-card__header">
            <h3>专属信息</h3>
          </div>
          <div class="form-exclusive-info">
            <p class="form-exclusive-info__desc">
              设置提交后展示给填写者的专属信息，如：兑换码、领取链接、VIP时长等。如果不设置，将使用全局的专属信息。
            </p>
            <div class="form-exclusive-list">
              <div v-for="(value, key) in exclusiveInfo" :key="key" class="form-exclusive-item">
                <input
                  :value="key"
                  type="text"
                  class="form-exclusive-item__label"
                  maxlength="64"
                  aria-label="专属信息名称"
                  placeholder="名称"
                  @change="renameExclusiveItem(key as string, $event)"
                />
                <input
                  v-model="exclusiveInfo[key]"
                  type="text"
                  class="form-exclusive-item__input"
                  maxlength="1000"
                  aria-label="专属信息内容"
                  placeholder="内容"
                  @blur="onExclusiveInfoChange"
                />
                <button class="form-exclusive-item__remove" type="button" aria-label="删除专属信息" @click="removeExclusiveItem(key as string)">
                  <X :size="14" />
                </button>
              </div>
            </div>
            <button class="form-exclusive-add-btn" type="button" @click="addExclusiveItem">
              <Plus :size="14" />
              添加专属信息
            </button>
          </div>
        </div>

        <!-- 高级设置 -->
        <div v-if="formId" class="form-settings-card">
          <div class="form-settings-row">
            <div class="form-settings-row__info">
              <span class="form-settings-row__label">删除表单</span>
              <span class="form-settings-row__desc">删除后无法恢复</span>
            </div>
            <button class="form-settings-danger" @click="confirmDelete">
              <Trash2 :size="14" />
              删除
            </button>
          </div>
        </div>
      </main>
    </FormSettings>

    <!-- 底部操作栏 - 仅编辑页面显示 -->
    <footer v-if="activeTab === 'edit'" class="form-footer">
      <button class="form-footer__btn secondary" type="button" :disabled="saving" @click="save">
        <Save class="form-inline-icon" :size="16" />
        {{ isEditing ? '保存修改' : '保存草稿' }}
      </button>
      <button v-if="published" class="form-footer__btn secondary" @click="openForm">
        <ExternalLink class="form-inline-icon" :size="16" />
        查看表单
      </button>
      <button class="form-footer__btn primary" type="button" :disabled="saving" @click="publish">
        <Send class="form-inline-icon form-inline-icon--wide" :size="16" />
        {{ published ? '保存并更新' : '发布表单' }}
      </button>
    </footer>

    <ConfirmDialog
      v-model="deleteDialogOpen"
      danger
      title="确认删除"
      message="删除后无法恢复，确定要删除这个表单吗？"
      confirm-text="删除"
      @confirm="doDeleteForm"
    />
  </div>
</template>
