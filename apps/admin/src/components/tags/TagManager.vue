<script setup lang="ts">
// ChenDoc v2.10.0 - 标签管理组件
import { ref, computed, onMounted } from "vue";
import {
  FileText, Folder, Star, Heart, Flag, Book, BookOpen,
  Briefcase, Code, Database, Globe, Image, Music, Video,
  Camera, Lock, Mail, Phone, Settings, Tag as LucideTag, Zap,
  Lightbulb, Rocket, Target, X
} from "lucide-vue-next";
import {
  listTags, createTag, updateTag, deleteTag,
  TAG_COLORS, TAG_ICONS, type Tag
} from "../../api/tags.js";

// 图标映射
const iconMap: Record<string, any> = {
  FileText, Folder, Star, Heart, Flag, Book, BookOpen,
  Briefcase, Code, Database, Globe, Image, Music, Video,
  Camera, Lock, Mail, Phone, Settings, Tag: LucideTag, Zap,
  Lightbulb, Rocket, Target
};

const emit = defineEmits<{
  (e: "select", tag: Tag): void;
  (e: "change"): void;
}>();

const props = defineProps<{
  selected?: number[];
}>();

// 状态
const tags = ref<Tag[]>([]);
const loading = ref(false);
const error = ref("");
const editingId = ref<number | null>(null);
const editName = ref("");
const editColor = ref("");
const editIcon = ref("");
const showCreateForm = ref(false);
const newTagName = ref("");
const newTagColor = ref<string>(TAG_COLORS[0]);
const newTagIcon = ref("");

// 计算属性
const sortedTags = computed(() => {
  return [...tags.value].sort((a, b) => {
    if (b.docCount !== a.docCount) return b.docCount - a.docCount;
    return a.name.localeCompare(b.name);
  });
});

const isSelected = (tagId: number) => {
  return props.selected?.includes(tagId) ?? false;
};

// 加载标签
async function loadTags() {
  loading.value = true;
  error.value = "";
  try {
    tags.value = await listTags();
  } catch (e: any) {
    error.value = e.message || "加载标签失败";
  } finally {
    loading.value = false;
  }
}

// 创建标签
async function handleCreate() {
  if (!newTagName.value.trim()) return;

  try {
    await createTag({
      name: newTagName.value.trim(),
      color: newTagColor.value,
    });
    newTagName.value = "";
    newTagColor.value = TAG_COLORS[0];
    showCreateForm.value = false;
    await loadTags();
    emit("change");
  } catch (e: any) {
    error.value = e.message || "创建标签失败";
  }
}

// 开始编辑
function startEdit(tag: Tag) {
  editingId.value = tag.id;
  editName.value = tag.name;
  editColor.value = tag.color;
  editIcon.value = tag.icon || "";
}

// 保存编辑
async function saveEdit(tag: Tag) {
  if (!editName.value.trim()) return;

  try {
    await updateTag(tag.id, {
      name: editName.value.trim(),
      color: editColor.value,
      icon: editIcon.value || undefined,
    });
    editingId.value = null;
    await loadTags();
    emit("change");
  } catch (e: any) {
    error.value = e.message || "更新标签失败";
  }
}

// 取消编辑
function cancelEdit() {
  editingId.value = null;
  editName.value = "";
  editColor.value = "";
  editIcon.value = "";
}

// 删除标签
async function handleDelete(tag: Tag) {
  if (!confirm(`确定要删除标签「${tag.name}」吗？文档中的此标签也会被移除。`)) {
    return;
  }

  try {
    await deleteTag(tag.id);
    await loadTags();
    emit("change");
  } catch (e: any) {
    error.value = e.message || "删除标签失败";
  }
}

// 选择标签
function selectTag(tag: Tag) {
  emit("select", tag);
}

// 获取图标组件
function getIconComponent(iconName: string) {
  return iconName ? iconMap[iconName] : null;
}

// 初始化
onMounted(() => {
  void loadTags();
});
</script>

<template>
  <div class="tag-manager">
    <div class="tag-manager__header">
      <h3>标签管理</h3>
      <button class="cd-button" @click="showCreateForm = !showCreateForm">
        {{ showCreateForm ? "取消" : "新建标签" }}
      </button>
    </div>

    <!-- 创建表单 -->
    <div v-if="showCreateForm" class="tag-manager__create">
      <input
        v-model="newTagName"
        class="cd-input"
        placeholder="标签名称"
        maxlength="32"
        @keyup.enter="handleCreate"
      />
      <div class="tag-manager__section-label">颜色</div>
      <div class="tag-manager__colors">
        <button
          v-for="color in TAG_COLORS"
          :key="color"
          class="tag-manager__color"
          :class="{ active: newTagColor === color }"
          :style="{ backgroundColor: color }"
          @click="newTagColor = color"
        />
      </div>
      <div class="tag-manager__section-label">图标</div>
      <div class="tag-manager__icons">
        <button
          v-for="iconName in TAG_ICONS"
          :key="iconName"
          class="tag-manager__icon"
          :class="{ active: newTagIcon === iconName }"
          @click="newTagIcon = iconName"
        >
          <component v-if="iconName && iconMap[iconName]" :is="iconMap[iconName]" :size="16" />
          <X v-else :size="16" />
        </button>
      </div>
      <button class="cd-button primary" @click="handleCreate">创建</button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="cd-error">{{ error }}</div>

    <!-- 加载状态 -->
    <div v-if="loading" class="tag-manager__loading">
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
      <span class="cd-skeleton" />
    </div>

    <!-- 标签列表 -->
    <div v-else class="tag-manager__list">
      <div
        v-for="tag in sortedTags"
        :key="tag.id"
        class="tag-manager__item"
        :class="{ selected: isSelected(tag.id) }"
      >
        <!-- 编辑模式 -->
        <template v-if="editingId === tag.id">
          <input
            v-model="editName"
            class="cd-input"
            placeholder="标签名称"
            maxlength="32"
            @keyup.enter="saveEdit(tag)"
            @keyup.esc="cancelEdit"
          />
          <div class="tag-manager__colors">
            <button
              v-for="color in TAG_COLORS"
              :key="color"
              class="tag-manager__color"
              :class="{ active: editColor === color }"
              :style="{ backgroundColor: color }"
              @click="editColor = color"
            />
          </div>
          <div class="tag-manager__icons">
            <button
              v-for="iconName in TAG_ICONS"
              :key="iconName"
              class="tag-manager__icon"
              :class="{ active: editIcon === iconName }"
              @click="editIcon = iconName"
            >
              <component v-if="iconName && iconMap[iconName]" :is="iconMap[iconName]" :size="16" />
              <X v-else :size="16" />
            </button>
          </div>
          <button class="cd-button primary" @click="saveEdit(tag)">保存</button>
          <button class="cd-button" @click="cancelEdit">取消</button>
        </template>

        <!-- 查看模式 -->
        <template v-else>
          <div class="tag-manager__tag" @click="selectTag(tag)">
            <span class="tag-manager__icon-wrap" :style="{ color: tag.color }">
              <component v-if="tag.icon && getIconComponent(tag.icon)" :is="getIconComponent(tag.icon)" :size="14" />
            </span>
            <span
              class="tag-manager__dot"
              :style="{ backgroundColor: tag.color }"
            />
            <span class="tag-manager__name">{{ tag.name }}</span>
            <span class="tag-manager__count">{{ tag.docCount }}</span>
          </div>
          <div class="tag-manager__actions">
            <button class="tag-manager__action" @click.stop="startEdit(tag)" title="编辑">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button class="tag-manager__action danger" @click.stop="handleDelete(tag)" title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </template>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && tags.length === 0" class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
        <p>暂无标签</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-manager {
  display: grid;
  gap: 12px;
}

.tag-manager__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tag-manager__header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--cd-ink);
}

.tag-manager__create {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
  background: var(--cd-paper-soft);
}

.tag-manager__colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-manager__section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--cd-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 4px;
}

.tag-manager__icons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-manager__icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--cd-border);
  border-radius: 6px;
  background: var(--cd-panel);
  color: var(--cd-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.tag-manager__icon:hover {
  border-color: var(--cd-border-strong);
  color: var(--cd-text);
  background: var(--cd-paper-soft);
}

.tag-manager__icon.active {
  border-color: var(--cd-primary);
  background: var(--cd-primary-soft);
  color: var(--cd-primary);
}

.tag-manager__icon-wrap {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.tag-manager__color {
  width: 24px;
  height: 24px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}

.tag-manager__color:hover {
  transform: scale(1.15);
}

.tag-manager__color.active {
  border-color: var(--cd-ink);
}

.tag-manager__loading {
  display: grid;
  gap: 8px;
}

.tag-manager__loading span {
  height: 40px;
}

.tag-manager__list {
  display: grid;
  gap: 4px;
}

.tag-manager__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: var(--cd-radius);
  background: var(--cd-panel);
  transition: background-color 0.15s;
}

.tag-manager__item:hover {
  background: var(--cd-paper-soft);
}

.tag-manager__item.selected {
  background: var(--cd-accent-soft);
}

.tag-manager__tag {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.tag-manager__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tag-manager__name {
  font-size: 13px;
  color: var(--cd-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-manager__count {
  font-size: 11px;
  color: var(--cd-muted);
  flex-shrink: 0;
}

.tag-manager__actions {
  display: flex;
  gap: 4px;
}

.tag-manager__action {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--cd-radius);
  background: transparent;
  color: var(--cd-muted);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.tag-manager__action:hover {
  background: var(--cd-primary-soft);
  color: var(--cd-text);
}

.tag-manager__action.danger:hover {
  background: var(--cd-danger-soft);
  color: var(--cd-danger);
}

.tag-manager__item .cd-input {
  flex: 1;
  min-width: 0;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--cd-muted);
}

.empty-state svg {
  margin-bottom: 8px;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}
</style>
