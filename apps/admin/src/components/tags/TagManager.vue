<script setup lang="ts">
import { computed, onMounted, ref, type Component } from "vue";
import {
  Book,
  BookOpen,
  Briefcase,
  Camera,
  Code,
  Database,
  FileText,
  Flag,
  Folder,
  Globe,
  Heart,
  Image,
  Lightbulb,
  Lock,
  Mail,
  Music,
  Phone,
  Rocket,
  Settings,
  Star,
  Tag as LucideTag,
  Target,
  Video,
  Zap
} from "lucide-vue-next";
import { createTag, deleteTag, listTags, TAG_COLORS, type Tag, updateTag } from "@/services/api";
import TagCreateForm from "./TagCreateForm.vue";
import TagList from "./TagList.vue";
import "./tag-manager.css";

const iconMap: Record<string, Component> = {
  FileText,
  Folder,
  Star,
  Heart,
  Flag,
  Book,
  BookOpen,
  Briefcase,
  Code,
  Database,
  Globe,
  Image,
  Music,
  Video,
  Camera,
  Lock,
  Mail,
  Phone,
  Settings,
  Tag: LucideTag,
  Zap,
  Lightbulb,
  Rocket,
  Target
};

const props = defineProps<{
  selected?: number[];
}>();

const emit = defineEmits<{
  select: [tag: Tag];
  change: [];
}>();

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

const sortedTags = computed(() => {
  return [...tags.value].sort((a, b) => {
    if (b.docCount !== a.docCount) return b.docCount - a.docCount;
    return a.name.localeCompare(b.name);
  });
});

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

async function handleCreate() {
  const name = newTagName.value.trim();
  if (!name) return;

  try {
    await createTag({
      name,
      color: newTagColor.value,
      icon: newTagIcon.value || undefined
    });
    newTagName.value = "";
    newTagColor.value = TAG_COLORS[0];
    newTagIcon.value = "";
    showCreateForm.value = false;
    await loadTags();
    emit("change");
  } catch (e: any) {
    error.value = e.message || "创建标签失败";
  }
}

function startEdit(tag: Tag) {
  editingId.value = tag.id;
  editName.value = tag.name;
  editColor.value = tag.color;
  editIcon.value = tag.icon || "";
}

async function saveEdit(tag: Tag) {
  const name = editName.value.trim();
  if (!name) return;

  try {
    await updateTag(tag.id, {
      name,
      color: editColor.value,
      icon: editIcon.value || undefined
    });
    editingId.value = null;
    await loadTags();
    emit("change");
  } catch (e: any) {
    error.value = e.message || "更新标签失败";
  }
}

function cancelEdit() {
  editingId.value = null;
  editName.value = "";
  editColor.value = "";
  editIcon.value = "";
}

async function handleDelete(tag: Tag) {
  if (!confirm(`确定要删除标签「${tag.name}」吗？文档中的此标签也会被移除。`)) return;

  try {
    await deleteTag(tag.id);
    await loadTags();
    emit("change");
  } catch (e: any) {
    error.value = e.message || "删除标签失败";
  }
}

onMounted(() => {
  void loadTags();
});
</script>

<template>
  <div class="tag-manager">
    <div class="tag-manager__header">
      <h3>标签管理</h3>
      <button class="cd-button" type="button" @click="showCreateForm = !showCreateForm">
        {{ showCreateForm ? "取消" : "新建标签" }}
      </button>
    </div>

    <TagCreateForm
      v-if="showCreateForm"
      :name="newTagName"
      :color="newTagColor"
      :icon="newTagIcon"
      :icon-map="iconMap"
      @update:name="newTagName = $event"
      @update:color="newTagColor = $event"
      @update:icon="newTagIcon = $event"
      @create="handleCreate"
    />

    <div v-if="error" class="cd-error">{{ error }}</div>

    <TagList
      :loading="loading"
      :tags="sortedTags"
      :selected="props.selected"
      :editing-id="editingId"
      :edit-name="editName"
      :edit-color="editColor"
      :edit-icon="editIcon"
      :icon-map="iconMap"
      @select="emit('select', $event)"
      @start-edit="startEdit"
      @delete="handleDelete"
      @save-edit="saveEdit"
      @cancel-edit="cancelEdit"
      @update:edit-name="editName = $event"
      @update:edit-color="editColor = $event"
      @update:edit-icon="editIcon = $event"
    />
  </div>
</template>
