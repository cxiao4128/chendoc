<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { FilePlus2 } from "lucide-vue-next";
import { getDocApi, type DocSummary } from "../../api/docs";
import { useDocStore } from "../../stores/doc";
import { useWorkspaceRoutes } from "../../composables/useWorkspaceRoutes";
import "./css/utility-pages.css";

const router = useRouter();
const docs = useDocStore();
const { docPath } = useWorkspaceRoutes();
const creatingKey = ref("");

type TemplateDefinition = { key: string; title: string; summary: string; html: string };
const baseTemplates: TemplateDefinition[] = [
  {
    key: "note",
    title: "知识卡片",
    summary: "标题、要点、引用和下一步。",
    html: "<h2>知识卡片</h2><ul><li>核心结论：</li><li>来源：</li><li>下一步：</li></ul>"
  },
  {
    key: "plan",
    title: "方案记录",
    summary: "背景、目标、步骤、风险。",
    html: "<h2>方案记录</h2><h3>背景</h3><p></p><h3>目标</h3><p></p><h3>执行步骤</h3><p></p><h3>风险</h3><p></p>"
  },
  {
    key: "weekly",
    title: "周报",
    summary: "本周完成、问题、下周计划。",
    html: "<h2>周报</h2><h3>本周完成</h3><p></p><h3>问题</h3><p></p><h3>下周计划</h3><p></p>"
  }
];
const customTemplates = ref<TemplateDefinition[]>([]);
const templates = computed(() => [...baseTemplates, ...customTemplates.value]);

const recentDocs = computed(() => docs.docs.slice(0, 6));

onMounted(() => {
  try { customTemplates.value = JSON.parse(localStorage.getItem("chendoc_custom_templates") || "[]"); } catch { customTemplates.value = []; }
  void docs.loadList();
});

async function createFromTemplate(template: TemplateDefinition) {
  creatingKey.value = template.key;
  try {
    const doc = await docs.createDoc(template.title);
    await docs.saveDoc(doc.docUid, { summary: template.summary, contentHtml: template.html });
    router.push(docPath(doc.docUid));
  } finally {
    creatingKey.value = "";
  }
}

async function saveAsTemplate(doc: DocSummary) {
  const detail = (await getDocApi(doc.docUid)).doc;
  const template: TemplateDefinition = {
    key: `custom-${doc.docUid}`,
    title: doc.title,
    summary: detail.summary || "从当前文档保存",
    html: detail.contentHtml
  };
  customTemplates.value = [template, ...customTemplates.value.filter((item) => item.key !== template.key)].slice(0, 20);
  localStorage.setItem("chendoc_custom_templates", JSON.stringify(customTemplates.value));
}
</script>

<template>
  <section class="utility-page">
    <header>
      <div>
        <h1>模板中心 <span aria-hidden="true">✦</span></h1>
        <p>用固定模板创建真实文档。</p>
      </div>
    </header>

    <div class="utility-page__grid">
      <button v-for="template in templates" :key="template.key" type="button" :disabled="!!creatingKey" @click="createFromTemplate(template)">
        <FilePlus2 :size="22" />
        <strong>{{ template.title }}</strong>
        <span>{{ template.summary }}</span>
        <small>{{ creatingKey === template.key ? "创建中" : "创建文档" }}</small>
      </button>
    </div>

    <section class="utility-page__panel">
      <strong>最近文档</strong>
      <div v-for="doc in recentDocs" :key="doc.docUid" class="utility-page__template-source">
        <RouterLink :to="docPath(doc.docUid)">{{ doc.title }}</RouterLink>
        <button type="button" @click="saveAsTemplate(doc)">保存为模板</button>
      </div>
    </section>
  </section>
</template>
