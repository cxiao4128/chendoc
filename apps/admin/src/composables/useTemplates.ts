// ChenDoc v2.10.0 - 模板管理 Composable
// 提供模板的响应式状态管理

import { ref, computed } from "vue";
import {
  listTemplates,
  listBuiltInTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  MAX_TEMPLATES_PER_USER,
  type Template,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from "../api/templates.js";

export function useTemplates() {
  // 状态
  const templates = ref<Template[]>([]);
  const builtInTemplates = ref<Template[]>([]);
  const currentTemplate = ref<Template | null>(null);
  const loading = ref(false);
  const error = ref("");

  // 计算属性
  const userTemplates = computed(() =>
    templates.value.filter(t => !t.isBuiltIn)
  );

  const canCreateMore = computed(() =>
    userTemplates.value.length < MAX_TEMPLATES_PER_USER
  );

  const remainingSlots = computed(() =>
    MAX_TEMPLATES_PER_USER - userTemplates.value.length
  );

  // 加载用户模板
  async function loadTemplates() {
    loading.value = true;
    error.value = "";
    try {
      templates.value = await listTemplates();
    } catch (e: any) {
      error.value = e.message || "加载模板失败";
    } finally {
      loading.value = false;
    }
  }

  // 加载内置模板
  async function loadBuiltInTemplates() {
    try {
      builtInTemplates.value = await listBuiltInTemplates();
    } catch (e: any) {
      console.error("加载内置模板失败:", e);
    }
  }

  // 获取单个模板
  async function loadTemplate(id: number) {
    loading.value = true;
    error.value = "";
    try {
      currentTemplate.value = await getTemplate(id);
    } catch (e: any) {
      error.value = e.message || "加载模板失败";
    } finally {
      loading.value = false;
    }
  }

  // 创建模板
  async function addTemplate(input: CreateTemplateInput): Promise<Template | null> {
    loading.value = true;
    error.value = "";
    try {
      const template = await createTemplate(input);
      templates.value.push(template);
      return template;
    } catch (e: any) {
      error.value = e.message || "创建模板失败";
      return null;
    } finally {
      loading.value = false;
    }
  }

  // 更新模板
  async function editTemplate(id: number, input: UpdateTemplateInput): Promise<Template | null> {
    loading.value = true;
    error.value = "";
    try {
      const template = await updateTemplate(id, input);
      const index = templates.value.findIndex(t => t.id === id);
      if (index >= 0 && template) {
        templates.value[index] = template;
      }
      if (currentTemplate.value?.id === id && template) {
        currentTemplate.value = template;
      }
      return template;
    } catch (e: any) {
      error.value = e.message || "更新模板失败";
      return null;
    } finally {
      loading.value = false;
    }
  }

  // 删除模板
  async function removeTemplate(id: number): Promise<boolean> {
    loading.value = true;
    error.value = "";
    try {
      await deleteTemplate(id);
      templates.value = templates.value.filter(t => t.id !== id);
      if (currentTemplate.value?.id === id) {
        currentTemplate.value = null;
      }
      return true;
    } catch (e: any) {
      error.value = e.message || "删除模板失败";
      return false;
    } finally {
      loading.value = false;
    }
  }

  // 保存文档为模板
  async function saveAsTemplate(
    title: string,
    html: string,
    options?: { summary?: string; contentJson?: string }
  ): Promise<Template | null> {
    if (!canCreateMore.value) {
      error.value = `模板数量已达上限（${MAX_TEMPLATES_PER_USER}个）`;
      return null;
    }
    return addTemplate({
      title,
      html,
      summary: options?.summary,
      contentJson: options?.contentJson,
    });
  }

  return {
    // 状态
    templates,
    builtInTemplates,
    currentTemplate,
    loading,
    error,
    // 计算属性
    userTemplates,
    canCreateMore,
    remainingSlots,
    MAX_TEMPLATES_PER_USER,
    // 方法
    loadTemplates,
    loadBuiltInTemplates,
    loadTemplate,
    addTemplate,
    editTemplate,
    removeTemplate,
    saveAsTemplate,
  };
}